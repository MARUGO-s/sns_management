-- Additive SNS-only manual X publication receipts. Apply this exact migration only.
-- There is deliberately no scheduler, provider call, stored access token or retry of sending.
-- Explicit future media opt-in accepts one additional scope; no existing config is mutated.
create or replace function public.social_x_oauth_configure(p_workspace uuid, p_user uuid, p_app_id text,
 p_client_secret text, p_scopes text, p_callback text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i uuid;
begin
  perform social_private.x_oauth_require_member(p_workspace,p_user);
  if length(p_app_id) not between 1 and 512 or length(p_client_secret)>65536 then raise exception 'invalid_config'; end if;
  if p_scopes not in ('tweet.read tweet.write users.read offline.access',
    'tweet.read tweet.write users.read offline.access media.write') then raise exception 'invalid_scopes'; end if;
  insert into public.social_integrations(workspace_id,channel,app_id,scopes,callback_url,created_by)
    values(p_workspace,'x',p_app_id,p_scopes,p_callback,p_user)
    on conflict(workspace_id,channel) do update set app_id=excluded.app_id, scopes=excluded.scopes,
      callback_url=excluded.callback_url, updated_at=now()
    returning id into i;
  insert into public.social_x_oauth_configs(integration_id) values(i) on conflict do nothing;
  perform 1 from public.social_x_oauth_configs where integration_id=i for update;
  insert into public.social_integration_secrets(integration_id,client_secret)
    values(i,p_client_secret) on conflict(integration_id) do update
    set client_secret=case when p_client_secret='' then public.social_integration_secrets.client_secret else p_client_secret end,
      updated_at=now();
  return i;
end;
$$;

create table public.social_x_publication_attempts (
  id uuid primary key default gen_random_uuid(),
  -- The BEFORE DELETE post fence retains every active/uncertain/successful receipt.
  -- Rejected-only drafts may be deliberately deleted together with their failed attempts.
  post_id uuid not null references public.social_posts(id) on delete cascade,
  workspace_id uuid not null references public.social_workspaces(id) on delete restrict,
  request_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  state text not null default 'preparing'
    check (state in ('preparing','sending','published','rejected','unknown')),
  remote_post_id text check (remote_post_id is null or remote_post_id ~ '^[0-9]{1,30}$'),
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, request_id),
  check ((state='published') = (remote_post_id is not null))
);
-- Rejected attempts may be explicitly retried with a fresh request, all other outcomes fence
-- the post forever. A send whose response is lost is not evidence of rejection.
create unique index social_x_publication_attempts_one_live_post on public.social_x_publication_attempts(post_id)
  where state <> 'rejected';
create index social_x_publication_attempts_workspace_created on public.social_x_publication_attempts(workspace_id,created_at desc);
create table social_private.x_publication_payloads (
  attempt_id uuid primary key references public.social_x_publication_attempts(id) on delete cascade,
  body text not null,
  file_ids uuid[] not null,
  files jsonb not null,
  expected jsonb not null,
  media jsonb not null default '[]',
  lease uuid,
  lease_expires_at timestamptz,
  integration_id uuid,
  token_revision uuid,
  token_version bigint,
  account_id text,
  sending_lease uuid
);
alter table public.social_x_publication_attempts enable row level security;
alter table social_private.x_publication_payloads enable row level security;
revoke all on public.social_x_publication_attempts, social_private.x_publication_payloads from public,anon,authenticated;
grant select on public.social_x_publication_attempts to authenticated;
grant select,insert,update on public.social_x_publication_attempts, social_private.x_publication_payloads to service_role;
create policy "workspace members can read safe X receipts" on public.social_x_publication_attempts
  for select to authenticated using (social_private.is_social_workspace_member(workspace_id));

create function social_private.x_publish_require_editor(w uuid,u uuid) returns void
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; member_role text;
begin
  if w is null or u is null then raise exception 'forbidden'; end if;
  select created_by into owner_id from public.social_workspaces where id=w for share;
  if owner_id=u then return; end if;
  select role into member_role from public.social_workspace_members where workspace_id=w and user_id=u for share;
  if member_role is null or member_role not in ('owner','admin','member') then raise exception 'forbidden'; end if;
end;
$$;

-- Private binding has no token value. Public preview exposes only an opaque digest and
-- a syntactically safe username; expired but verified tokens are allowed for one refresh.
create function social_private.x_publish_connection_state(w uuid,u uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.social_integrations; c public.social_x_oauth_configs; fingerprint text;
begin
  perform social_private.x_publish_require_editor(w,u);
  select * into i from public.social_integrations where workspace_id=w and channel='x' for update;
  select * into c from public.social_x_oauth_configs where integration_id=i.id for update;
  if i.id is null or i.status<>'configured' or c.token_revision is distinct from c.revision
    or c.account_id is null or c.account_username is null or c.expires_at is null
    or i.scopes not in ('tweet.read tweet.write users.read offline.access',
      'tweet.read tweet.write users.read offline.access media.write')
    or not exists(select 1 from public.social_integration_secrets where integration_id=i.id
      and access_token is not null and access_token<>'') then raise exception 'not_connected'; end if;
  if c.refresh_lease_expires_at>now() or exists(select 1 from public.social_x_oauth_states
    where integration_id=i.id and expires_at>now() and finished_at is null) then raise exception 'busy'; end if;
  fingerprint=encode(sha256(convert_to(jsonb_build_array(i.id,c.revision,c.token_version,c.account_id,i.scopes)::text,'UTF8')),'hex');
  return jsonb_build_object('fingerprint',fingerprint,'integrationId',i.id,'revision',c.revision,
    'version',c.token_version,'accountId',c.account_id)
    || case when c.account_username ~ '^[A-Za-z0-9_]{1,15}$'
      then jsonb_build_object('username',c.account_username) else '{}'::jsonb end;
end;
$$;
create function public.social_x_publish_connection(p_workspace uuid,p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare connection jsonb;
begin
  connection=social_private.x_publish_connection_state(p_workspace,p_user);
  return jsonb_build_object('fingerprint',connection->>'fingerprint')
    || case when connection ? 'username' then jsonb_build_object('username',connection->>'username') else '{}'::jsonb end;
end;
$$;

create function social_private.x_publish_blocked(p uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.social_x_publication_attempts where post_id=p and state<>'rejected');
$$;
create function social_private.x_publish_post_fence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if social_private.x_publish_blocked(old.id) then
    if tg_op='UPDATE' and new.id=old.id and new.workspace_id=old.workspace_id
      and new.title=old.title and new.body=old.body and new.scheduled_at is not distinct from old.scheduled_at
      and new.owner_name=old.owner_name and new.format=old.format and new.created_by=old.created_by
      and new.created_at=old.created_at
      and (new.status=old.status or (new.status='published'
        and exists(select 1 from public.social_x_publication_attempts where post_id=old.id and state='published')
        and not exists(select 1 from public.social_post_channels where post_id=old.id and channel<>'x')))
      then return new; end if;
    raise exception 'publication_locked';
  end if;
  return coalesce(new,old);
end;
$$;
create trigger social_x_publish_post_fence before update or delete on public.social_posts
  for each row execute function social_private.x_publish_post_fence();

create function social_private.x_publish_child_fence() returns trigger
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; p uuid;
begin
  if tg_op='INSERT' then ids=array[new.post_id];
  elsif tg_op='DELETE' then ids=array[old.post_id];
  else ids=array[old.post_id,new.post_id]; end if;
  -- Consistent post-first order also covers a row moved from one post to another.
  for p in select distinct unnest(ids) order by 1 loop
    perform 1 from public.social_posts where id=p for update;
    if social_private.x_publish_blocked(p) then raise exception 'publication_locked'; end if;
  end loop;
  return coalesce(new,old);
end;
$$;
create trigger social_x_publish_files_fence before insert or update or delete on public.social_post_files
  for each row execute function social_private.x_publish_child_fence();
create trigger social_x_publish_channels_fence before insert or update or delete on public.social_post_channels
  for each row execute function social_private.x_publish_child_fence();

create function social_private.x_publish_storage_fence() returns trigger
language plpgsql security definer set search_path='' as $$
declare names text[]='{}'; path text; p uuid;
begin
  -- Never affect other applications/buckets in the shared Storage service.
  if tg_op<>'INSERT' and old.bucket_id='social-post-files' then names=array_append(names,old.name); end if;
  if tg_op<>'DELETE' and new.bucket_id='social-post-files' then names=array_append(names,new.name); end if;
  -- Storage path is workspace/post/filename. Parse both old/new paths, so overwriting,
  -- moving, deleting or recreating an object is fenced even after a file row is missing.
  for p in select distinct split_part(v,'/',2)::uuid from unnest(names) v
    where split_part(v,'/',2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    order by 1 loop
    perform 1 from public.social_posts where id=p for update;
    if social_private.x_publish_blocked(p) then raise exception 'publication_locked'; end if;
  end loop;
  return coalesce(new,old);
end;
$$;
create trigger social_x_publish_storage_fence before insert or update or delete on storage.objects
  for each row execute function social_private.x_publish_storage_fence();

create function social_private.x_publish_snapshot(p uuid,w uuid,ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare files jsonb; total integer;
begin
  if ids is null or cardinality(ids)>4 or array_position(ids,null) is not null
    or cardinality(ids)<>(select count(distinct id) from unnest(ids) id)
    then raise exception 'invalid_request'; end if;
  select count(*),coalesce(jsonb_agg(jsonb_build_object('id',f.id,'storagePath',f.storage_path,
    'mimeType',f.content_type,'sizeBytes',f.file_size) order by requested.ordinality),'[]'::jsonb)
    into total,files from unnest(ids) with ordinality requested(id,ordinality)
    join public.social_post_files f on f.id=requested.id
    where f.post_id=p and f.workspace_id=w and f.media_variant='original'
      and f.storage_path like w::text||'/'||p::text||'/%'
      and length(substring(f.storage_path from length(w::text||'/'||p::text||'/')+1))>0
      and position('..' in f.storage_path)=0;
  if total<>cardinality(ids) then raise exception 'invalid_request'; end if;
  return files;
end;
$$;
create function social_private.x_publish_result(a public.social_x_publication_attempts,claimed boolean) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('attemptId',a.id,'postId',a.post_id,'workspaceId',a.workspace_id,
    'requestId',a.request_id,'state',a.state,'claimed',claimed,'errorCode',a.error_code,
    'remotePostId',a.remote_post_id) || case when claimed then
      jsonb_build_object('body',p.body,'files',p.files,'media',p.media) else '{}'::jsonb end
    from social_private.x_publication_payloads p where p.attempt_id=a.id;
$$;

create function public.social_x_publish_prepare(p_post uuid,p_user uuid,p_request uuid,p_files uuid[],p_lease uuid,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare post public.social_posts; a public.social_x_publication_attempts; payload social_private.x_publication_payloads;
  files jsonb; expected_files jsonb='[]'; item jsonb; connection jsonb; file_size bigint;
begin
  if p_post is null or p_user is null or p_request is null or p_lease is null or p_expected is null
    or jsonb_typeof(p_expected)<>'object' or octet_length(p_expected::text)>65536
    or not (p_expected ?& array['body','files','connectionFingerprint'])
    or exists(select 1 from jsonb_object_keys(p_expected) key where key not in ('body','files','connectionFingerprint'))
    or jsonb_typeof(p_expected->'body')<>'string' or length(p_expected->>'body')>10000
    or jsonb_typeof(p_expected->'files')<>'array' or jsonb_array_length(p_expected->'files')>4
    or jsonb_typeof(p_expected->'connectionFingerprint')<>'string'
    or p_expected->>'connectionFingerprint' !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
  for item in select value from jsonb_array_elements(p_expected->'files') loop
    if jsonb_typeof(item)<>'object' or not (item ?& array['id','storagePath','mimeType','sizeBytes','sha256'])
      or exists(select 1 from jsonb_object_keys(item) key where key not in ('id','storagePath','mimeType','sizeBytes','sha256'))
      or jsonb_typeof(item->'id')<>'string' or length(item->>'id')<>36
      or jsonb_typeof(item->'storagePath')<>'string' or length(item->>'storagePath') not between 1 and 1024
      or jsonb_typeof(item->'mimeType')<>'string' or length(item->>'mimeType') not between 1 and 128
      or jsonb_typeof(item->'sizeBytes')<>'number' or item->>'sizeBytes' !~ '^(0|[1-9][0-9]{0,9})$'
      or jsonb_typeof(item->'sha256')<>'string' or item->>'sha256' !~ '^[a-f0-9]{64}$'
      then raise exception 'invalid_request'; end if;
    file_size=(item->>'sizeBytes')::bigint;
    if file_size>536870912 then raise exception 'invalid_request'; end if;
    expected_files=expected_files||jsonb_build_array(item-'sha256');
  end loop;
  select * into post from public.social_posts where id=p_post for update;
  if post.id is null then raise exception 'invalid_request'; end if;
  perform social_private.x_publish_require_editor(post.workspace_id,p_user);
  files=social_private.x_publish_snapshot(post.id,post.workspace_id,p_files);
  if p_expected->>'body'<>post.body or expected_files<>files then raise exception 'stale_snapshot'; end if;
  select * into a from public.social_x_publication_attempts where post_id=p_post and request_id=p_request for update;
  if a.id is not null then
    if a.user_id<>p_user then raise exception 'stale_snapshot'; end if;
    select * into payload from social_private.x_publication_payloads where attempt_id=a.id for update;
    -- Same-key media resumes may follow our own verified refresh. Compare immutable
    -- content/hashes, never replace the stored generation from a caller's new preview.
    if payload.body<>post.body or payload.file_ids<>p_files or payload.files<>p_expected->'files'
      then raise exception 'stale_snapshot'; end if;
    if a.state='sending' and payload.lease_expires_at<=now() then
      update public.social_x_publication_attempts set state='unknown',error_code='unknown_result',updated_at=now()
        where id=a.id returning * into a;
    end if;
    if a.state<>'preparing' then return social_private.x_publish_result(a,false); end if;
    if payload.lease_expires_at>now() and payload.lease is distinct from p_lease then
      return social_private.x_publish_result(a,false);
    end if;
    update social_private.x_publication_payloads set lease=p_lease,lease_expires_at=now()+interval '120 seconds'
      where attempt_id=a.id;
    return social_private.x_publish_result(a,true);
  end if;
  -- Different request keys cannot bypass an uncertain/active or completed attempt.
  select * into a from public.social_x_publication_attempts where post_id=p_post and state<>'rejected' for update;
  if a.id is not null then
    select * into payload from social_private.x_publication_payloads where attempt_id=a.id for update;
    if a.state='sending' and payload.lease_expires_at<=now() then
      update public.social_x_publication_attempts set state='unknown',error_code='unknown_result',updated_at=now()
        where id=a.id returning * into a;
    end if;
    return social_private.x_publish_result(a,false);
  end if;
  if post.status='published' then raise exception 'already_published'; end if;
  if not exists(select 1 from public.social_post_channels where post_id=p_post and channel='x') then raise exception 'invalid_request'; end if;
  if length(post.body)>10000 or (post.body='' and cardinality(p_files)=0) then raise exception 'invalid_request'; end if;
  connection=social_private.x_publish_connection_state(post.workspace_id,p_user);
  if p_expected->>'connectionFingerprint'<>connection->>'fingerprint' then raise exception 'stale_snapshot'; end if;
  insert into public.social_x_publication_attempts(post_id,workspace_id,request_id,user_id)
    values(p_post,post.workspace_id,p_request,p_user) returning * into a;
  insert into social_private.x_publication_payloads(attempt_id,body,file_ids,files,expected,lease,lease_expires_at,
    integration_id,token_revision,token_version,account_id)
    values(a.id,post.body,p_files,p_expected->'files',p_expected,p_lease,now()+interval '120 seconds',
      (connection->>'integrationId')::uuid,(connection->>'revision')::uuid,(connection->>'version')::bigint,connection->>'accountId');
  return social_private.x_publish_result(a,true);
end;
$$;

-- Return only to the service Function. Lock post before attempt to match mutation fences.
create function social_private.x_publish_owned(p_attempt uuid,p_user uuid,p_lease uuid)
returns public.social_x_publication_attempts language plpgsql security definer set search_path='' as $$
declare a public.social_x_publication_attempts; payload social_private.x_publication_payloads; locked_post_id uuid;
begin
  select p.post_id into locked_post_id from public.social_x_publication_attempts p where id=p_attempt;
  perform 1 from public.social_posts where id=locked_post_id for update;
  select * into a from public.social_x_publication_attempts where id=p_attempt for update;
  select * into payload from social_private.x_publication_payloads where attempt_id=p_attempt for update;
  if a.id is null or a.user_id is distinct from p_user or a.state<>'preparing'
    or payload.lease is distinct from p_lease or p_lease is null or payload.lease_expires_at<=now()
    then raise exception 'busy'; end if;
  perform social_private.x_publish_require_editor(a.workspace_id,p_user);
  return a;
end;
$$;

create function public.social_x_publish_token(p_attempt uuid,p_user uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.social_x_publication_attempts; payload social_private.x_publication_payloads;
  i public.social_integrations; c public.social_x_oauth_configs; token text;
begin
  a=social_private.x_publish_owned(p_attempt,p_user,p_lease);
  select * into i from public.social_integrations where workspace_id=a.workspace_id and channel='x' for update;
  select * into c from public.social_x_oauth_configs where integration_id=i.id for update;
  select * into payload from social_private.x_publication_payloads where attempt_id=a.id;
  if i.id is null or i.status<>'configured' or c.token_revision is distinct from c.revision
    or c.account_id is null or c.account_username is null or c.expires_at is null
    or i.scopes not in ('tweet.read tweet.write users.read offline.access',
      'tweet.read tweet.write users.read offline.access media.write') then raise exception 'not_connected'; end if;
  if cardinality(payload.file_ids)>0 and i.scopes<>'tweet.read tweet.write users.read offline.access media.write'
    then raise exception 'media_permission_required'; end if;
  if c.refresh_lease_expires_at>now() or exists(select 1 from public.social_x_oauth_states
    where integration_id=i.id and expires_at>now() and finished_at is null) then raise exception 'busy'; end if;
  if payload.integration_id is not null and (payload.integration_id<>i.id
    or payload.account_id is distinct from c.account_id
    or (payload.token_revision is distinct from c.revision and not (
      c.last_refresh_lease is not null and c.last_refresh_user=p_user
      and c.last_refresh_revision=payload.token_revision and c.last_refresh_version=payload.token_version
      and c.token_version=payload.token_version+1)))
    then raise exception 'not_connected'; end if;
  select access_token into token from public.social_integration_secrets where integration_id=i.id;
  if token is null or token='' then raise exception 'not_connected'; end if;
  update social_private.x_publication_payloads set integration_id=i.id,token_revision=c.revision,
    token_version=c.token_version,account_id=c.account_id where attempt_id=a.id;
  return jsonb_build_object('accessToken',token,'expiresAt',c.expires_at,'integrationId',i.id,
    'needsRefresh',c.expires_at<now()+interval '120 seconds','workspaceId',a.workspace_id,
    'revision',c.revision,'version',c.token_version);
end;
$$;

create function public.social_x_publish_media(p_attempt uuid,p_user uuid,p_lease uuid,p_media jsonb,p_release boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.social_x_publication_attempts; payload social_private.x_publication_payloads;
  item jsonb; previous jsonb; n integer=0; expiry timestamptz; next_check timestamptz; pending boolean=false;
begin
  a=social_private.x_publish_owned(p_attempt,p_user,p_lease);
  select * into payload from social_private.x_publication_payloads where attempt_id=a.id;
  if p_media is null or jsonb_typeof(p_media)<>'array' or jsonb_array_length(p_media)>cardinality(payload.file_ids)
    or p_release is null then raise exception 'unsupported_media'; end if;
  for item in select value from jsonb_array_elements(p_media) loop
    n=n+1;
    if jsonb_typeof(item)<>'object' or (item->>'id') is null or item->>'id' !~ '^[0-9]{1,30}$'
      or (item->>'state') is null or item->>'state' not in ('pending','ready')
      or (item->>'expiresAt') is null or length(item->>'expiresAt')>64
      or exists(select 1 from jsonb_object_keys(item) key where key not in ('id','expiresAt','state','nextCheckAt'))
      then raise exception 'unsupported_media'; end if;
    begin
      expiry=(item->>'expiresAt')::timestamptz;
      next_check=(item->>'nextCheckAt')::timestamptz;
    exception when others then raise exception 'unsupported_media'; end;
    if expiry<=now() or expiry>now()+interval '2 days'
      or (item->>'state'='pending' and (next_check is null or next_check>expiry or next_check<now()-interval '1 minute'))
      then raise exception 'unsupported_media'; end if;
    previous=payload.media->(n-1);
    -- Once persisted, never replace a provider media ID or extend its lifetime.
    if previous is not null and (previous->>'id'<>item->>'id'
      or (previous->>'expiresAt')::timestamptz<expiry
      or (previous->>'state'='ready' and item->>'state'<>'ready'))
      then raise exception 'stale_snapshot'; end if;
    pending=pending or item->>'state'='pending';
  end loop;
  if n<jsonb_array_length(payload.media) or (select count(distinct value->>'id') from jsonb_array_elements(p_media))<>n
    or (p_release and not pending) then raise exception 'unsupported_media'; end if;
  update social_private.x_publication_payloads set media=p_media,
    lease=case when p_release then null else lease end,
    lease_expires_at=case when p_release then null else lease_expires_at end where attempt_id=a.id;
  update public.social_x_publication_attempts set updated_at=now() where id=a.id returning * into a;
  return social_private.x_publish_result(a,not p_release);
end;
$$;

create function public.social_x_publish_dispatch(p_attempt uuid,p_user uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.social_x_publication_attempts; payload social_private.x_publication_payloads;
  i public.social_integrations; c public.social_x_oauth_configs; token text; body text; ids jsonb;
begin
  a=social_private.x_publish_owned(p_attempt,p_user,p_lease);
  select * into payload from social_private.x_publication_payloads where attempt_id=a.id;
  select p.body into body from public.social_posts p where p.id=a.post_id;
  if body<>payload.body or social_private.x_publish_snapshot(a.post_id,a.workspace_id,payload.file_ids)<>(
    select coalesce(jsonb_agg(value-'sha256' order by ordinality),'[]'::jsonb)
      from jsonb_array_elements(payload.files) with ordinality)
    or not exists(select 1 from public.social_post_channels where post_id=a.post_id and channel='x')
    then raise exception 'stale_snapshot'; end if;
  select * into i from public.social_integrations where id=payload.integration_id for update;
  select * into c from public.social_x_oauth_configs where integration_id=i.id for update;
  if i.id is null or i.workspace_id<>a.workspace_id or i.channel<>'x' or i.status<>'configured'
    or i.scopes not in ('tweet.read tweet.write users.read offline.access',
      'tweet.read tweet.write users.read offline.access media.write')
    or c.token_revision is distinct from c.revision or c.revision is distinct from payload.token_revision
    or c.token_version is distinct from payload.token_version or c.account_id is distinct from payload.account_id
    or c.expires_at is null or c.expires_at<now()+interval '30 seconds'
    then raise exception 'not_connected'; end if;
  if cardinality(payload.file_ids)>0 and i.scopes<>'tweet.read tweet.write users.read offline.access media.write'
    then raise exception 'media_permission_required'; end if;
  if c.refresh_lease_expires_at>now() or exists(select 1 from public.social_x_oauth_states
    where integration_id=i.id and expires_at>now() and finished_at is null) then raise exception 'busy'; end if;
  if jsonb_array_length(payload.media)<>cardinality(payload.file_ids)
    or exists(select 1 from jsonb_array_elements(payload.media) m
      where m->>'state'<>'ready' or (m->>'expiresAt')::timestamptz<=now()+interval '30 seconds')
    then raise exception 'media_expired'; end if;
  select access_token into token from public.social_integration_secrets where integration_id=i.id;
  if token is null or token='' then raise exception 'not_connected'; end if;
  select coalesce(jsonb_agg(value->>'id' order by ordinality),'[]'::jsonb) into ids
    from jsonb_array_elements(payload.media) with ordinality;
  update public.social_x_publication_attempts set state='sending',updated_at=now() where id=a.id;
  update social_private.x_publication_payloads set sending_lease=p_lease,
    lease_expires_at=now()+interval '120 seconds' where attempt_id=a.id;
  -- COMMIT this RPC before the provider POST. Never call the provider on a failed/lost RPC.
  return jsonb_build_object('attemptId',a.id,'accessToken',token,'body',payload.body,'mediaIds',ids);
end;
$$;

create function public.social_x_publish_finish(p_attempt uuid,p_lease uuid,p_state text,p_remote text,p_error text)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.social_x_publication_attempts; payload social_private.x_publication_payloads; locked_post_id uuid;
begin
  if p_lease is null or p_state is null or p_state not in ('published','rejected','unknown')
    or (p_state='published' and (p_remote is null or p_remote !~ '^[0-9]{1,30}$'))
    or (p_state<>'published' and p_remote is not null)
    or (p_error is not null and p_error not in (
      'invalid_request','forbidden','not_connected','not_configured','busy','stale_snapshot',
      'unsupported_media','publication_locked','already_published','media_expired','storage_failed',
      'invalid_text','media_too_large','invalid_media','media_failed','provider_unavailable',
      'authorization_failed','invalid_token','rate_limited','provider_rejected','unknown_result',
      'invalid_state','media_permission_required')) then raise exception 'invalid_request'; end if;
  select p.post_id into locked_post_id from public.social_x_publication_attempts p where p.id=p_attempt;
  perform 1 from public.social_posts where id=locked_post_id for update;
  select * into a from public.social_x_publication_attempts where id=p_attempt for update;
  select * into payload from social_private.x_publication_payloads where attempt_id=p_attempt for update;
  if a.id is null then raise exception 'invalid_request'; end if;
  -- Durable dispatch lease is retained even after a stale sending receipt becomes unknown.
  if (a.state in ('sending','unknown','published') and payload.sending_lease is distinct from p_lease)
    or (a.state in ('preparing','rejected') and payload.lease is distinct from p_lease)
    then raise exception 'busy'; end if;
  if a.state=p_state and a.remote_post_id is not distinct from p_remote and a.error_code is not distinct from p_error
    then return true; end if;
  if a.state='preparing' and (p_state<>'rejected' or payload.lease_expires_at<=now())
    then raise exception 'invalid_request'; end if;
  if a.state not in ('preparing','sending','unknown') or (a.state='unknown' and p_state<>'published')
    then raise exception 'invalid_request'; end if;
  -- This receipt records known external success even when authorization/config changed
  -- AFTER dispatch. No fresh membership check is allowed to discard that evidence.
  update public.social_x_publication_attempts set state=p_state,remote_post_id=p_remote,error_code=p_error,
    updated_at=now() where id=a.id returning * into a;
  if p_state='published' and not exists(select 1 from public.social_post_channels
    where post_id=a.post_id and channel<>'x') then
    update public.social_posts set status='published',updated_at=now() where id=a.post_id;
  end if;
  return true;
end;
$$;

revoke all on function social_private.x_publish_require_editor(uuid,uuid),
  social_private.x_publish_connection_state(uuid,uuid),
  social_private.x_publish_blocked(uuid),social_private.x_publish_post_fence(),
  social_private.x_publish_child_fence(),social_private.x_publish_storage_fence(),
  social_private.x_publish_snapshot(uuid,uuid,uuid[]),
  social_private.x_publish_result(public.social_x_publication_attempts,boolean),
  social_private.x_publish_owned(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.social_x_publish_connection(uuid,uuid),
  public.social_x_publish_prepare(uuid,uuid,uuid,uuid[],uuid,jsonb),
  public.social_x_publish_token(uuid,uuid,uuid),
  public.social_x_publish_media(uuid,uuid,uuid,jsonb,boolean),
  public.social_x_publish_dispatch(uuid,uuid,uuid),
  public.social_x_publish_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.social_x_publish_connection(uuid,uuid),
  public.social_x_publish_prepare(uuid,uuid,uuid,uuid[],uuid,jsonb),
  public.social_x_publish_token(uuid,uuid,uuid),
  public.social_x_publish_media(uuid,uuid,uuid,jsonb,boolean),
  public.social_x_publish_dispatch(uuid,uuid,uuid),
  public.social_x_publish_finish(uuid,uuid,text,text,text) to service_role;
