-- Additive SNS-only OAuth state. Never run db reset/push against the shared project.
create table public.social_x_oauth_configs (
  integration_id uuid primary key references public.social_integrations(id) on delete cascade,
  revision uuid not null default gen_random_uuid(),
  token_revision uuid,
  token_version bigint not null default 0,
  expires_at timestamptz,
  account_id text,
  account_username text,
  refresh_lease uuid,
  refresh_lease_expires_at timestamptz,
  last_refresh_lease uuid,
  last_refresh_revision uuid,
  last_refresh_version bigint,
  last_refresh_user uuid
);
create table public.social_x_oauth_states (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  integration_id uuid not null references public.social_integrations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision uuid not null,
  verifier text not null,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  finished_at timestamptz
);
alter table public.social_x_oauth_configs enable row level security;
alter table public.social_x_oauth_states enable row level security;
revoke all on public.social_x_oauth_configs, public.social_x_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on public.social_x_oauth_configs, public.social_x_oauth_states to service_role;

create function social_private.x_oauth_member(w uuid, u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.social_workspaces where id=w and created_by=u)
  or exists (select 1 from public.social_workspace_members where workspace_id=w and user_id=u);
$$;
-- Keep owner/member authorization valid until the mutation transaction commits.
-- Concurrent membership removal or owner change must wait for these row locks.
create function social_private.x_oauth_require_member(w uuid, u uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  select created_by into owner_id from public.social_workspaces where id=w for share;
  if owner_id is null then raise exception 'forbidden'; end if;
  if owner_id=u then return; end if;
  perform 1 from public.social_workspace_members where workspace_id=w and user_id=u for share;
  if not found then raise exception 'forbidden'; end if;
end;
$$;

-- Both legacy manual credentials and direct metadata edits invalidate pending handshakes.
create function social_private.x_oauth_invalidate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'social_integrations' then
    if new.app_id is distinct from old.app_id or new.scopes is distinct from old.scopes
       or new.callback_url is distinct from old.callback_url
       or new.channel is distinct from old.channel or new.workspace_id is distinct from old.workspace_id then
      update public.social_x_oauth_configs set revision=gen_random_uuid(), refresh_lease=null,
        refresh_lease_expires_at=null where integration_id=new.id;
      -- Keep old credentials intact, but never label them connected to the changed client/config.
      if exists(select 1 from public.social_x_oauth_configs where integration_id=new.id and token_revision is not null) then
        update public.social_integrations set status='needs_review' where id=new.id;
      end if;
    end if;
  else
    if tg_op='UPDATE' and new.client_secret is not distinct from old.client_secret
      and new.access_token is not distinct from old.access_token
      and new.refresh_token is not distinct from old.refresh_token then return new; end if;
    update public.social_x_oauth_configs set revision=gen_random_uuid(), token_version=token_version+1,
      refresh_lease=null, refresh_lease_expires_at=null,
      expires_at=null, account_id=null, account_username=null, token_revision=null, last_refresh_lease=null
      where integration_id=coalesce(new.integration_id, old.integration_id);
    if coalesce(new.access_token,old.access_token,'')<>'' then
      update public.social_integrations set status='needs_review'
        where id=coalesce(new.integration_id,old.integration_id)
          and exists(select 1 from public.social_x_oauth_configs where integration_id=coalesce(new.integration_id,old.integration_id));
    end if;
  end if;
  return coalesce(new,old);
end;
$$;
create trigger social_x_oauth_integration_revision after update on public.social_integrations
for each row execute function social_private.x_oauth_invalidate();
create trigger social_x_oauth_secret_revision after insert or update or delete on public.social_integration_secrets
for each row execute function social_private.x_oauth_invalidate();

create function public.social_x_oauth_configure(p_workspace uuid, p_user uuid, p_app_id text,
 p_client_secret text, p_scopes text, p_callback text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i uuid;
begin
  perform social_private.x_oauth_require_member(p_workspace,p_user);
  if length(p_app_id) not between 1 and 512 or length(p_client_secret)>65536 then raise exception 'invalid_config'; end if;
  if p_scopes <> 'tweet.read tweet.write users.read offline.access' then raise exception 'invalid_scopes'; end if;
  insert into public.social_integrations(workspace_id,channel,app_id,scopes,callback_url,created_by)
    values(p_workspace,'x',p_app_id,p_scopes,p_callback,p_user)
    on conflict(workspace_id,channel) do update set app_id=excluded.app_id, scopes=excluded.scopes,
      callback_url=excluded.callback_url, updated_at=now()
    returning id into i;
  -- Row lock serializes configure against start/commit/refresh.
  insert into public.social_x_oauth_configs(integration_id) values(i) on conflict do nothing;
  perform 1 from public.social_x_oauth_configs where integration_id=i for update;
  insert into public.social_integration_secrets(integration_id,client_secret)
    values(i,p_client_secret) on conflict(integration_id) do update
    set client_secret=case when p_client_secret='' then public.social_integration_secrets.client_secret else p_client_secret end,
      updated_at=now();
  -- Triggers invalidate changed settings/secrets. An unchanged configure preserves a working
  -- connection, its expiry/identity metadata, and any in-flight refresh.
  return i;
end;
$$;

create function public.social_x_oauth_begin(p_workspace uuid,p_user uuid,p_hash text,p_verifier text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.social_integrations; c public.social_x_oauth_configs;
begin
  perform social_private.x_oauth_require_member(p_workspace,p_user);
  select * into i from public.social_integrations where workspace_id=p_workspace and channel='x' for update;
  select * into c from public.social_x_oauth_configs where integration_id=i.id for update;
  if i.id is null or c.integration_id is null or i.app_id='' then raise exception 'not_configured'; end if;
  if c.refresh_lease_expires_at > now() then raise exception 'busy'; end if;
  -- Supersede starts for the same user/integration and bound stored state lifetime.
  delete from public.social_x_oauth_states where expires_at < now()
    or (integration_id=i.id and user_id=p_user);
  insert into public.social_x_oauth_states(state_hash,integration_id,user_id,revision,verifier,expires_at)
    values(p_hash,i.id,p_user,c.revision,p_verifier,now()+interval '10 minutes');
  return jsonb_build_object('appId',i.app_id,'scopes',i.scopes);
end;
$$;

create function public.social_x_oauth_claim(p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.social_x_oauth_states; i public.social_integrations; c public.social_x_oauth_configs; secret text;
begin
  -- Take integration before config/state locks, matching configure and refresh.
  select integ.* into i from public.social_integrations integ join public.social_x_oauth_states st
    on st.integration_id=integ.id where st.state_hash=p_hash for update of integ;
  if i.id is null then raise exception 'invalid_state'; end if;
  select * into c from public.social_x_oauth_configs where integration_id=i.id for update;
  select * into s from public.social_x_oauth_states where state_hash=p_hash for update;
  if s.state_hash is null or s.claimed_at is not null or s.expires_at <= now()
    or s.revision <> c.revision or not social_private.x_oauth_member(i.workspace_id,s.user_id)
    then raise exception 'invalid_state'; end if;
  if c.refresh_lease_expires_at>now() then raise exception 'busy'; end if;
  begin perform social_private.x_oauth_require_member(i.workspace_id,s.user_id);
    exception when others then raise exception 'invalid_state'; end;
  update public.social_x_oauth_states set claimed_at=now() where state_hash=p_hash;
  select client_secret into secret from public.social_integration_secrets where integration_id=i.id;
  return jsonb_build_object('appId',i.app_id,'clientSecret',coalesce(secret,''),'scopes',i.scopes,
    'verifier',s.verifier,'integrationId',i.id,'revision',c.revision);
end;
$$;

create function public.social_x_oauth_finish(p_hash text,p_access text,p_refresh text,p_expires timestamptz,
 p_account_id text,p_username text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare s public.social_x_oauth_states; i public.social_integrations; c public.social_x_oauth_configs;
begin
  select integ.* into i from public.social_integrations integ join public.social_x_oauth_states st
    on st.integration_id=integ.id where st.state_hash=p_hash for update of integ;
  if i.id is null then raise exception 'invalid_state'; end if;
  select * into c from public.social_x_oauth_configs where integration_id=i.id for update;
  select * into s from public.social_x_oauth_states where state_hash=p_hash for update;
  if s.state_hash is null or s.claimed_at is null or s.finished_at is not null or s.expires_at<=now()
    or s.revision<>c.revision or not social_private.x_oauth_member(i.workspace_id,s.user_id)
    then raise exception 'invalid_state'; end if;
  if c.refresh_lease_expires_at>now() then raise exception 'busy'; end if;
  begin perform social_private.x_oauth_require_member(i.workspace_id,s.user_id);
    exception when others then raise exception 'invalid_state'; end;
  if p_access is null or p_refresh is null or p_expires is null or p_account_id is null or p_username is null
    or p_access='' or p_refresh='' or p_expires<=now() then raise exception 'invalid_token'; end if;
  update public.social_integration_secrets set access_token=p_access,refresh_token=p_refresh,updated_at=now() where integration_id=i.id;
  if not found then raise exception 'invalid_state'; end if;
  update public.social_x_oauth_configs set expires_at=p_expires,account_id=p_account_id,account_username=p_username,
    token_revision=revision where integration_id=i.id;
  update public.social_integrations set status='configured',updated_at=now() where id=i.id;
  update public.social_x_oauth_states set finished_at=now(),verifier='' where state_hash=p_hash;
  return true;
end;
$$;

create function public.social_x_oauth_refresh_claim(p_workspace uuid,p_user uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.social_integrations; c public.social_x_oauth_configs; s public.social_integration_secrets;
begin
  perform social_private.x_oauth_require_member(p_workspace,p_user);
  select * into i from public.social_integrations where workspace_id=p_workspace and channel='x' for update;
  select * into c from public.social_x_oauth_configs where integration_id=i.id for update;
  if c.integration_id is null then raise exception 'not_configured'; end if;
  if i.status<>'configured' or c.token_revision is distinct from c.revision
    or c.account_id is null or c.account_username is null then raise exception 'not_connected'; end if;
  if c.refresh_lease_expires_at>now() then raise exception 'busy'; end if;
  -- Authorization exchange and refresh must not overlap.
  if exists(select 1 from public.social_x_oauth_states where integration_id=i.id and claimed_at is not null
    and finished_at is null and expires_at>now()) then raise exception 'busy'; end if;
  select * into s from public.social_integration_secrets where integration_id=i.id;
  if s.refresh_token is null or s.refresh_token='' then raise exception 'not_connected'; end if;
  update public.social_x_oauth_configs set refresh_lease=p_lease,refresh_lease_expires_at=now()+interval '60 seconds' where integration_id=i.id;
  return jsonb_build_object('appId',i.app_id,'clientSecret',s.client_secret,'refreshToken',s.refresh_token,
    'revision',c.revision,'version',c.token_version,'integrationId',i.id,'accountId',c.account_id,
    'accountUsername',c.account_username,'scopes',i.scopes);
end;
$$;

create function public.social_x_oauth_refresh_finish(p_integration uuid,p_user uuid,p_lease uuid,p_revision uuid,
 p_version bigint,p_access text,p_refresh text,p_expires timestamptz,p_account_id text,p_username text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare i public.social_integrations; c public.social_x_oauth_configs;
begin
  if p_lease is null or p_revision is null or p_version is null then raise exception 'invalid_state'; end if;
  select * into i from public.social_integrations where id=p_integration for update;
  select * into c from public.social_x_oauth_configs where integration_id=p_integration for update;
  begin perform social_private.x_oauth_require_member(i.workspace_id,p_user);
    exception when others then raise exception 'invalid_state'; end;
  -- Idempotent receipt: a lost RPC response can retry the identical committed rotation.
  -- Check actual current credentials too, never overwrite newer rotations or changed configs.
  if c.last_refresh_lease=p_lease and c.last_refresh_revision=p_revision
    and c.last_refresh_version=p_version and c.last_refresh_user=p_user
    and c.token_revision=c.revision and i.status='configured'
    and c.expires_at=p_expires and c.account_id=p_account_id and c.account_username=p_username
    and exists(select 1 from public.social_integration_secrets where integration_id=p_integration
      and access_token=p_access and refresh_token=p_refresh) then return true; end if;
  if c.integration_id is null or c.refresh_lease is distinct from p_lease or c.refresh_lease_expires_at<=now()
    or c.revision<>p_revision or c.token_version<>p_version or not social_private.x_oauth_member(i.workspace_id,p_user)
    or i.status<>'configured' or c.token_revision is distinct from c.revision
    then raise exception 'invalid_state'; end if;
  if p_access is null or p_refresh is null or p_expires is null
    or p_access='' or p_refresh='' or p_expires<=now() or c.account_id is distinct from p_account_id
    or c.account_username is distinct from p_username then raise exception 'invalid_token'; end if;
  update public.social_integration_secrets set access_token=p_access,refresh_token=p_refresh,updated_at=now() where integration_id=p_integration;
  if not found then raise exception 'invalid_state'; end if;
  update public.social_x_oauth_configs set expires_at=p_expires,account_id=p_account_id,account_username=p_username,
    token_revision=revision,refresh_lease=null,refresh_lease_expires_at=null,
    last_refresh_lease=p_lease,last_refresh_revision=p_revision,last_refresh_version=p_version,last_refresh_user=p_user
    where integration_id=p_integration;
  update public.social_integrations set status='configured',updated_at=now() where id=p_integration;
  return true;
end;
$$;

-- Legacy mutation must not read/merge a secrets snapshot in an Edge Function. Keep omitted
-- fields current inside the same transaction, serialized with OAuth rotation and membership.
create function public.social_integration_secrets_mutate(p_workspace uuid,p_user uuid,p_channel text,p_action text,
 p_client_secret text,p_access_token text,p_refresh_token text,p_webhook_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i uuid; s public.social_integration_secrets;
begin
  if p_channel not in ('instagram','tiktok','x','threads') or p_action not in ('save','delete')
    or greatest(length(p_client_secret),length(p_access_token),length(p_refresh_token),length(p_webhook_secret))>65536
    then raise exception 'invalid_request'; end if;
  select id into i from public.social_integrations where workspace_id=p_workspace and channel=p_channel for update;
  if i is null then raise exception 'not_configured'; end if;
  perform 1 from public.social_x_oauth_configs where integration_id=i for update;
  perform social_private.x_oauth_require_member(p_workspace,p_user);
  if p_action='delete' then
    delete from public.social_integration_secrets where integration_id=i;
    return jsonb_build_object('ok',true);
  end if;
  insert into public.social_integration_secrets(integration_id,client_secret,access_token,refresh_token,webhook_secret)
    values(i,p_client_secret,p_access_token,p_refresh_token,p_webhook_secret)
    on conflict(integration_id) do update set
      client_secret=case when excluded.client_secret='' then public.social_integration_secrets.client_secret else excluded.client_secret end,
      access_token=case when excluded.access_token='' then public.social_integration_secrets.access_token else excluded.access_token end,
      refresh_token=case when excluded.refresh_token='' then public.social_integration_secrets.refresh_token else excluded.refresh_token end,
      webhook_secret=case when excluded.webhook_secret='' then public.social_integration_secrets.webhook_secret else excluded.webhook_secret end,
      updated_at=now()
    returning * into s;
  return jsonb_build_object('ok',true,'status',jsonb_build_object('clientSecret',s.client_secret<>'',
    'accessToken',s.access_token<>'','refreshToken',s.refresh_token<>'','webhookSecret',s.webhook_secret<>''));
end;
$$;
create function public.social_x_oauth_refresh_release(p_integration uuid,p_lease uuid) returns void
language sql security definer set search_path = '' as $$
  update public.social_x_oauth_configs set refresh_lease=null,refresh_lease_expires_at=null
    where integration_id=p_integration and refresh_lease=p_lease;
$$;
create function public.social_x_oauth_cancel(p_hash text) returns void
language sql security definer set search_path = '' as $$
  update public.social_x_oauth_states set finished_at=now(),verifier=''
    where state_hash=p_hash and claimed_at is not null and finished_at is null;
$$;

-- New functions must never inherit PUBLIC EXECUTE, including the internal membership helper.
revoke all on function social_private.x_oauth_member(uuid,uuid),social_private.x_oauth_require_member(uuid,uuid),
 social_private.x_oauth_invalidate() from public,anon,authenticated;
revoke all on function public.social_x_oauth_configure(uuid,uuid,text,text,text,text),
 public.social_x_oauth_begin(uuid,uuid,text,text),public.social_x_oauth_claim(text),
 public.social_x_oauth_finish(text,text,text,timestamptz,text,text),
 public.social_x_oauth_refresh_claim(uuid,uuid,uuid),
 public.social_x_oauth_refresh_finish(uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,text),
 public.social_x_oauth_refresh_release(uuid,uuid),public.social_x_oauth_cancel(text),
 public.social_integration_secrets_mutate(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.social_x_oauth_configure(uuid,uuid,text,text,text,text),
 public.social_x_oauth_begin(uuid,uuid,text,text),public.social_x_oauth_claim(text),
 public.social_x_oauth_finish(text,text,text,timestamptz,text,text),
 public.social_x_oauth_refresh_claim(uuid,uuid,uuid),
 public.social_x_oauth_refresh_finish(uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,text),
 public.social_x_oauth_refresh_release(uuid,uuid),public.social_x_oauth_cancel(text),
 public.social_integration_secrets_mutate(uuid,uuid,text,text,text,text,text,text) to service_role;
