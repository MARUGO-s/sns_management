-- Additive, opt-in X-only scheduled publication queue.
-- No cron is installed and no production migration is applied by this file.
-- The queue is inert until the separately configured worker is invoked.

create table public.social_x_scheduled_publications (
  post_id uuid primary key references public.social_posts(id) on delete cascade,
  workspace_id uuid not null references public.social_workspaces(id) on delete cascade,
  scheduled_at timestamptz not null,
  state text not null default 'queued'
    check (state in ('queued','claimed','sending','published','failed','cancelled','unknown')),
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  remote_post_id text check (remote_post_id is null or remote_post_id ~ '^[0-9]{1,30}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state='published') = (remote_post_id is not null))
);
create index social_x_scheduled_publications_due
  on public.social_x_scheduled_publications(scheduled_at, post_id) where state='queued';
alter table public.social_x_scheduled_publications enable row level security;
revoke all on public.social_x_scheduled_publications from public, anon, authenticated, service_role;
grant select on public.social_x_scheduled_publications to authenticated;
create policy "workspace members can read safe X schedule status"
  on public.social_x_scheduled_publications for select to authenticated
  using (social_private.is_social_workspace_member(workspace_id));

-- This is an operator-controlled readiness marker, not an automatic schedule.
-- Keep it OFF until the worker secret and an external scheduler are configured.
create table social_private.x_schedule_runtime_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table social_private.x_schedule_runtime_settings enable row level security;
revoke all on social_private.x_schedule_runtime_settings from public, anon, authenticated, service_role;
insert into social_private.x_schedule_runtime_settings(singleton,enabled) values(true,false);

create table social_private.x_scheduled_publication_request_tombstones (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  request_id uuid not null,
  cancelled_at timestamptz not null default now(),
  primary key(post_id,request_id)
);
alter table social_private.x_scheduled_publication_request_tombstones enable row level security;
revoke all on social_private.x_scheduled_publication_request_tombstones from public, anon, authenticated, service_role;

create function social_private.x_schedule_is_enabled() returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select enabled from social_private.x_schedule_runtime_settings
    where singleton=true),false);
$$;

create function public.social_x_schedule_is_ready(p_workspace uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(p_workspace is not null and auth.uid() is not null
    and social_private.is_social_workspace_member(p_workspace)
    and social_private.x_schedule_is_enabled(),false);
$$;

-- Bodies, file hashes, account bindings, scheduler lease and request IDs are not
-- exposed through PostgREST. Only the SECURITY DEFINER RPCs below can read/write.
create table social_private.x_scheduled_publication_payloads (
  post_id uuid primary key references public.social_x_scheduled_publications(post_id) on delete cascade,
  request_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  integration_id uuid not null,
  connection_revision uuid not null,
  account_id text not null check (account_id ~ '^[0-9]{1,30}$'),
  scopes text not null check (scopes in (
    'tweet.read tweet.write users.read offline.access',
    'tweet.read tweet.write users.read offline.access media.write'
  )),
  connection_fingerprint text not null check (connection_fingerprint ~ '^[a-f0-9]{64}$'),
  expected jsonb not null check (jsonb_typeof(expected)='object'),
  next_check_at timestamptz,
  claim_token uuid,
  claim_expires_at timestamptz,
  claim_count integer not null default 0 check (claim_count between 0 and 12),
  created_at timestamptz not null default now(),
  check ((claim_token is null) = (claim_expires_at is null))
);
alter table social_private.x_scheduled_publication_payloads enable row level security;
revoke all on social_private.x_scheduled_publication_payloads from public, anon, authenticated, service_role;

create function social_private.x_schedule_blocked(p_post uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.social_x_scheduled_publications
    where post_id=p_post and state<>'cancelled'
  );
$$;

create function social_private.x_schedule_post_fence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not social_private.x_schedule_blocked(old.id) then return coalesce(new,old); end if;
  -- The existing publisher may make exactly the receipt-backed X-only status
  -- transition after X accepted a post. No content/target/schedule edits pass.
  if tg_op='UPDATE' and new.id=old.id and new.workspace_id=old.workspace_id
    and new.title=old.title and new.body=old.body
    and new.scheduled_at is not distinct from old.scheduled_at
    and new.owner_name=old.owner_name and new.format=old.format
    and new.created_by=old.created_by and new.created_at=old.created_at
    and (new.status=old.status or (new.status='published'
      and exists(select 1 from public.social_x_publication_attempts
        where post_id=old.id and state='published')
      and not exists(select 1 from public.social_post_channels
        where post_id=old.id and channel<>'x')))
    then return new; end if;
  raise exception 'publication_locked';
end;
$$;
create trigger social_x_schedule_post_fence before update or delete on public.social_posts
  for each row execute function social_private.x_schedule_post_fence();

create function social_private.x_schedule_child_fence() returns trigger
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; p uuid;
begin
  if tg_op='INSERT' then ids=array[new.post_id];
  elsif tg_op='DELETE' then ids=array[old.post_id];
  else ids=array[old.post_id,new.post_id]; end if;
  for p in select distinct unnest(ids) order by 1 loop
    perform 1 from public.social_posts where id=p for update;
    if social_private.x_schedule_blocked(p) then raise exception 'publication_locked'; end if;
  end loop;
  return coalesce(new,old);
end;
$$;
create trigger social_x_schedule_files_fence before insert or update or delete on public.social_post_files
  for each row execute function social_private.x_schedule_child_fence();
create trigger social_x_schedule_channels_fence before insert or update or delete on public.social_post_channels
  for each row execute function social_private.x_schedule_child_fence();

create function social_private.x_schedule_storage_fence() returns trigger
language plpgsql security definer set search_path='' as $$
declare names text[]='{}'; p uuid;
begin
  -- Constrain this trigger to the SNS file bucket; the shared gourmet buckets
  -- and their existing trigger behavior remain untouched.
  if tg_op<>'INSERT' and old.bucket_id='social-post-files' then names=array_append(names,old.name); end if;
  if tg_op<>'DELETE' and new.bucket_id='social-post-files' then names=array_append(names,new.name); end if;
  for p in select distinct split_part(v,'/',2)::uuid from unnest(names) v
    where split_part(v,'/',2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    order by 1 loop
    perform 1 from public.social_posts where id=p for update;
    if social_private.x_schedule_blocked(p) then raise exception 'publication_locked'; end if;
  end loop;
  return coalesce(new,old);
end;
$$;
create trigger social_x_schedule_storage_fence before insert or update or delete on storage.objects
  for each row execute function social_private.x_schedule_storage_fence();

-- A manual request cannot bypass an opted-in schedule. The worker's exact
-- request/user pair is allowed only while it owns an active queue claim.
create function social_private.x_schedule_attempt_fence() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.social_x_scheduled_publications; payload social_private.x_scheduled_publication_payloads;
begin
  select * into s from public.social_x_scheduled_publications where post_id=new.post_id;
  -- A cancelled schedule is still a durable request-ID tombstone. Do not let
  -- the old scheduled request turn back into a manual publication attempt.
  if exists(select 1 from social_private.x_scheduled_publication_request_tombstones
    where post_id=new.post_id and request_id=new.request_id)
    then raise exception 'schedule_cancelled'; end if;
  if s.post_id is null or s.state='cancelled' then return new; end if;
  select * into payload from social_private.x_scheduled_publication_payloads
    where post_id=new.post_id;
  if s.state in ('claimed','sending') and payload.request_id=new.request_id
    and payload.user_id=new.user_id and payload.claim_token is not null
    and payload.claim_expires_at>now() then return new; end if;
  raise exception 'publication_locked';
end;
$$;
create trigger social_x_schedule_attempt_insert_fence before insert on public.social_x_publication_attempts
  for each row execute function social_private.x_schedule_attempt_fence();

create function social_private.x_schedule_attempt_sending() returns trigger
language plpgsql security definer set search_path='' as $$
declare matched integer;
begin
  if old.state is distinct from new.state and new.state='sending' then
    -- This trigger also observes ordinary manual X publications. Only enforce
    -- scheduler readiness when this post has an active scheduled-publication
    -- row; otherwise the default-off scheduler would block manual posting.
    if not exists(select 1 from public.social_x_scheduled_publications
      where post_id=new.post_id and state<>'cancelled') then return new; end if;
    if not social_private.x_schedule_is_enabled() then raise exception 'schedule_not_ready'; end if;
    update public.social_x_scheduled_publications s set state='sending',updated_at=now()
      from social_private.x_scheduled_publication_payloads p
      where s.post_id=new.post_id and p.post_id=s.post_id
        and s.state='claimed' and p.request_id=new.request_id and p.user_id=new.user_id
        and p.claim_token is not null and p.claim_expires_at>now();
    get diagnostics matched=row_count;
    if matched=0 and exists(select 1 from public.social_x_scheduled_publications
      where post_id=new.post_id and state<>'cancelled') then raise exception 'publication_locked'; end if;
  end if;
  return new;
end;
$$;
create trigger social_x_schedule_attempt_sending_fence after update of state
  on public.social_x_publication_attempts for each row
  execute function social_private.x_schedule_attempt_sending();

-- Token rotation deliberately changes OAuth revision/version. Bind queued work
-- to stable client configuration and verified X identity instead, without
-- storing or returning the client secret or its digest.
create function social_private.x_schedule_connection_binding(
  p_workspace uuid,p_user uuid,p_integration uuid,p_account_id text
) returns text
language plpgsql security definer set search_path='' as $$
declare integration public.social_integrations; config public.social_x_oauth_configs;
  secret_fingerprint text;
begin
  perform social_private.x_publish_require_editor(p_workspace,p_user);
  select * into integration from public.social_integrations
    where id=p_integration and workspace_id=p_workspace and channel='x' for update;
  select * into config from public.social_x_oauth_configs
    where integration_id=p_integration for update;
  if integration.id is null or integration.status<>'configured'
    or config.account_id is distinct from p_account_id
    or config.token_revision is distinct from config.revision
    or config.account_id is null or config.account_username is null
    or config.expires_at is null then raise exception 'not_connected'; end if;
  select encode(sha256(convert_to(client_secret,'UTF8')),'hex') into secret_fingerprint
    from public.social_integration_secrets
    where integration_id=p_integration and client_secret is not null and client_secret<>'';
  if secret_fingerprint is null then raise exception 'not_connected'; end if;
  return encode(sha256(convert_to(jsonb_build_array(
    p_workspace,integration.id,integration.channel,integration.app_id,
    integration.callback_url,integration.scopes,config.account_id,secret_fingerprint
  )::text,'UTF8')),'hex');
end;
$$;

create function public.social_x_schedule_enqueue(p_post uuid,p_request uuid,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare post public.social_posts; existing public.social_x_scheduled_publications;
  existing_payload social_private.x_scheduled_publication_payloads;
  caller uuid=auth.uid(); connection jsonb; integration public.social_integrations;
  binding_fingerprint text;
  files jsonb; item jsonb; actual_files jsonb; count_files integer; images integer; videos integer;
  file_size bigint; scheduled_time timestamptz;
begin
  if p_post is null or p_request is null or caller is null or p_expected is null
    or jsonb_typeof(p_expected)<>'object' or octet_length(p_expected::text)>65536
    or not (p_expected ?& array['body','files','connectionFingerprint'])
    or exists(select 1 from jsonb_object_keys(p_expected) key
      where key not in ('body','files','connectionFingerprint'))
    or jsonb_typeof(p_expected->'body')<>'string' or length(p_expected->>'body')>10000
    or jsonb_typeof(p_expected->'files')<>'array'
    or jsonb_array_length(p_expected->'files')>4
    or jsonb_typeof(p_expected->'connectionFingerprint')<>'string'
    or p_expected->>'connectionFingerprint' !~ '^[a-f0-9]{64}$'
    then raise exception 'invalid_request'; end if;

  select * into post from public.social_posts where id=p_post for update;
  if post.id is null then raise exception 'invalid_request'; end if;
  perform social_private.x_publish_require_editor(post.workspace_id,caller);
  if coalesce(regexp_replace(post.body,'[[:space:]]','','g'),'')=''
    or coalesce(regexp_replace(p_expected->>'body','[[:space:]]','','g'),'')=''
    then raise exception 'invalid_text'; end if;
  select * into existing from public.social_x_scheduled_publications where post_id=p_post for update;
  if existing.post_id is not null then
    if existing.state<>'cancelled' then
      select * into existing_payload from social_private.x_scheduled_publication_payloads
        where post_id=p_post for update;
      -- A token refresh changes OAuth revision/version but not the actual bound
      -- X client/account. Compare the stable private binding for same-request
      -- idempotency; the browser's volatile token fingerprint may be stale.
      connection=social_private.x_publish_connection_state(post.workspace_id,caller);
      binding_fingerprint=social_private.x_schedule_connection_binding(
        post.workspace_id,caller,(connection->>'integrationId')::uuid,connection->>'accountId');
      if existing_payload.request_id=p_request and existing_payload.user_id=caller
        and existing_payload.connection_fingerprint=binding_fingerprint
        and existing_payload.expected=p_expected-'connectionFingerprint'
        then return jsonb_build_object('state',existing.state,'scheduledAt',existing.scheduled_at); end if;
      raise exception 'schedule_exists';
    end if;
    if exists(select 1 from social_private.x_scheduled_publication_request_tombstones
      where post_id=p_post and request_id=p_request)
      then raise exception 'schedule_cancelled'; end if;
    if exists(select 1 from social_private.x_scheduled_publication_payloads
      where post_id=p_post)
      then raise exception 'invalid_state'; end if;
  end if;
  if not social_private.x_schedule_is_enabled() then raise exception 'schedule_not_ready'; end if;
  if post.status<>'scheduled' or post.scheduled_at is null or post.scheduled_at<=now()
    or length(post.body)>10000
    or post.body<>p_expected->>'body' then raise exception 'stale_snapshot'; end if;
  if exists(select 1 from public.social_x_publication_attempts
    where post_id=p_post and state<>'rejected')
    then raise exception 'publication_locked'; end if;
  if (select count(*) from public.social_post_channels where post_id=p_post)<>1
    or not exists(select 1 from public.social_post_channels where post_id=p_post and channel='x')
    then raise exception 'invalid_request'; end if;

  count_files=jsonb_array_length(p_expected->'files');
  files='[]'::jsonb; images=0; videos=0;
  for item in select value from jsonb_array_elements(p_expected->'files') loop
    if jsonb_typeof(item)<>'object' or not (item ?& array['id','storagePath','mimeType','sizeBytes','sha256'])
      or exists(select 1 from jsonb_object_keys(item) key
        where key not in ('id','storagePath','mimeType','sizeBytes','sha256'))
      or jsonb_typeof(item->'id')<>'string' or item->>'id' !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89ab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or jsonb_typeof(item->'storagePath')<>'string'
      or length(item->>'storagePath') not between 1 and 1024
      or jsonb_typeof(item->'mimeType')<>'string'
      or item->>'mimeType' not in ('image/jpeg','image/png','video/mp4')
      or jsonb_typeof(item->'sizeBytes')<>'number'
      or item->>'sizeBytes' !~ '^[1-9][0-9]{0,9}$'
      or jsonb_typeof(item->'sha256')<>'string'
      or item->>'sha256' !~ '^[a-f0-9]{64}$'
      then raise exception 'invalid_request'; end if;
    file_size=(item->>'sizeBytes')::bigint;
    if item->>'mimeType'='video/mp4' then
      videos=videos+1;
      if file_size>20971520 then raise exception 'media_too_large'; end if;
    else
      images=images+1;
      if file_size>5242880 then raise exception 'media_too_large'; end if;
    end if;
    files=files||jsonb_build_array(item-'sha256');
  end loop;
  if videos>1 or (videos>0 and images>0) or images>4
    then raise exception 'unsupported_media'; end if;
  actual_files=social_private.x_publish_snapshot(
    p_post,post.workspace_id,
    coalesce((select array_agg((value->>'id')::uuid order by ordinality)
      from jsonb_array_elements(p_expected->'files') with ordinality),array[]::uuid[])
  );
  if files<>actual_files then raise exception 'stale_snapshot'; end if;

  connection=social_private.x_publish_connection_state(post.workspace_id,caller);
  if p_expected->>'connectionFingerprint'<>connection->>'fingerprint' then raise exception 'stale_snapshot'; end if;
  select * into integration from public.social_integrations
    where id=(connection->>'integrationId')::uuid and workspace_id=post.workspace_id and channel='x';
  if integration.id is null then raise exception 'not_connected'; end if;
  binding_fingerprint=social_private.x_schedule_connection_binding(
    post.workspace_id,caller,integration.id,connection->>'accountId');
  if count_files>0 and integration.scopes<>'tweet.read tweet.write users.read offline.access media.write'
    then raise exception 'media_permission_required'; end if;

  scheduled_time=post.scheduled_at;
  if existing.state='cancelled' then
    update public.social_x_scheduled_publications set workspace_id=post.workspace_id,
      scheduled_at=scheduled_time,state='queued',error_code=null,remote_post_id=null,updated_at=now()
      where post_id=p_post;
  else
    insert into public.social_x_scheduled_publications(post_id,workspace_id,scheduled_at)
      values(p_post,post.workspace_id,scheduled_time);
  end if;
  insert into social_private.x_scheduled_publication_payloads(
    post_id,request_id,user_id,integration_id,connection_revision,account_id,scopes,
    connection_fingerprint,expected,next_check_at)
    values(p_post,p_request,caller,(connection->>'integrationId')::uuid,
      (connection->>'revision')::uuid,connection->>'accountId',integration.scopes,
      binding_fingerprint,p_expected-'connectionFingerprint',scheduled_time);
  return jsonb_build_object('state','queued','scheduledAt',scheduled_time);
end;
$$;

create function public.social_x_schedule_cancel(p_post uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.social_x_scheduled_publications; p social_private.x_scheduled_publication_payloads;
  post public.social_posts; attempt public.social_x_publication_attempts; caller uuid=auth.uid();
begin
  if p_post is null or caller is null then raise exception 'forbidden'; end if;
  -- Use the same post -> queue lock order as enqueue and the existing publisher.
  -- This avoids a post/queue deadlock when a duplicate enqueue races cancellation.
  select post_row.* into post
    from public.social_posts post_row
    join public.social_x_scheduled_publications schedule_row on schedule_row.post_id=post_row.id
    where post_row.id=p_post for update of post_row;
  if post.id is null then raise exception 'invalid_request'; end if;
  perform social_private.x_publish_require_editor(post.workspace_id,caller);
  select * into s from public.social_x_scheduled_publications where post_id=p_post for update;
  if s.post_id is null then raise exception 'invalid_request'; end if;
  if s.state='cancelled' then return jsonb_build_object('state','cancelled'); end if;
  if s.state not in ('queued','failed') then raise exception 'busy'; end if;
  select * into p from social_private.x_scheduled_publication_payloads where post_id=p_post for update;
  if p.post_id is null then raise exception 'busy'; end if;
  if s.state='queued' then
    -- The publisher locks the post before it can advance preparing -> sending.
    -- Holding that same post lock makes it safe to terminate only this proven
    -- pre-send attempt; an in-flight or ambiguous create request stays fenced.
    select * into attempt from public.social_x_publication_attempts
      where post_id=p_post and request_id=p.request_id for update;
    if attempt.id is not null then
      if attempt.state<>'preparing' then raise exception 'busy'; end if;
      update public.social_x_publication_attempts set state='rejected',
        error_code='schedule_cancelled',updated_at=now()
        where id=attempt.id and state='preparing';
      if not found then raise exception 'busy'; end if;
    end if;
  end if;
  if s.state='failed' and exists(select 1 from public.social_x_publication_attempts
    where post_id=p_post and request_id=p.request_id and state<>'rejected')
    then raise exception 'busy'; end if;
  insert into social_private.x_scheduled_publication_request_tombstones(post_id,request_id)
    values(p_post,p.request_id) on conflict(post_id,request_id) do nothing;
  update public.social_x_scheduled_publications set state='cancelled',error_code=null,updated_at=now()
    where post_id=p_post returning * into s;
  delete from social_private.x_scheduled_publication_payloads where post_id=p_post;
  update public.social_posts set status='draft',scheduled_at=null,updated_at=now()
    where id=p_post and status='scheduled';
  if not found then raise exception 'stale_snapshot'; end if;
  return jsonb_build_object('state','cancelled');
end;
$$;

-- One item per tick and no lease stealing. Expired in-flight work is terminal:
-- it becomes failed only with a durable rejected receipt, published only with a
-- durable success receipt, otherwise unknown and never sent again.
create function public.social_x_schedule_claim_due()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; payload_record social_private.x_scheduled_publication_payloads;
  attempt public.social_x_publication_attempts; publication_payload social_private.x_publication_payloads;
  file_count integer; media_count integer;
  stale record;
begin
  if not social_private.x_schedule_is_enabled() then return null; end if;

  for stale in select row_.post_id,row_.state from public.social_x_scheduled_publications row_
    join social_private.x_scheduled_publication_payloads payload using(post_id)
    where row_.state in ('claimed','sending') and payload.claim_token is not null
      and payload.claim_expires_at<=now()
    for update of row_ skip locked
  loop
    select * into payload_record from social_private.x_scheduled_publication_payloads
      where post_id=stale.post_id for update;
    begin
      -- Dispatch locks post -> attempt before its trigger updates this schedule
      -- row. We already own the schedule lock, so never wait in the inverse
      -- order here: skip this stale item until the dispatch transaction ends.
      select * into attempt from public.social_x_publication_attempts
        where post_id=stale.post_id and request_id=payload_record.request_id
        for update nowait;
    exception when lock_not_available then
      -- End this tick promptly and release the queue/payload locks we already hold.
      return null;
    end;
    if attempt.state='published' then
      update public.social_x_scheduled_publications set state='published',
        remote_post_id=attempt.remote_post_id,error_code=null,updated_at=now()
        where post_id=stale.post_id;
    elsif attempt.state='rejected' then
      update public.social_x_scheduled_publications set state='failed',
        error_code=coalesce(attempt.error_code,'provider_rejected'),updated_at=now()
        where post_id=stale.post_id;
    elsif stale.state='claimed' and (attempt.id is null or attempt.state='preparing') then
      -- The provider create-post request cannot begin until the durable attempt
      -- transitions to `sending`. But media uploads happen before their IDs are
      -- persisted. Never reclaim a preparing attempt with an incomplete media
      -- checkpoint: an upload may have succeeded before the worker stopped.
      if attempt.id is not null then
        select * into publication_payload from social_private.x_publication_payloads
          where attempt_id=attempt.id;
        file_count=coalesce(jsonb_array_length(payload_record.expected->'files'),0);
        media_count=case when jsonb_typeof(publication_payload.media)='array'
          then jsonb_array_length(publication_payload.media) else 0 end;
      else
        file_count=0;
        media_count=0;
      end if;
      if file_count<>media_count then
        -- Stop rather than duplicate an upload whose X media ID was not saved.
        -- This is still pre-send, so mark the attempt rejected and allow the
        -- owner to cancel/review before explicitly scheduling a fresh attempt.
        if attempt.id is not null then
          update public.social_x_publication_attempts set state='rejected',
            error_code=case when file_count>media_count
              then 'schedule_media_checkpoint_incomplete' else 'invalid_state' end,
            updated_at=now() where id=attempt.id and state='preparing';
          update social_private.x_publication_payloads set lease=null,lease_expires_at=null
            where attempt_id=attempt.id;
        end if;
        update public.social_x_scheduled_publications set state='failed',
          error_code=case when file_count>media_count
            then 'schedule_media_checkpoint_incomplete' else 'invalid_state' end,
          updated_at=now() where post_id=stale.post_id;
        update social_private.x_scheduled_publication_payloads
          set claim_token=null,claim_expires_at=null,next_check_at=null
          where post_id=stale.post_id;
      elsif payload_record.claim_count>=12 then
        if attempt.id is not null then
          update public.social_x_publication_attempts set state='rejected',
            error_code='schedule_attempt_limit',updated_at=now()
            where id=attempt.id and state='preparing';
          update social_private.x_publication_payloads set lease=null,lease_expires_at=null
            where attempt_id=attempt.id;
        end if;
        update public.social_x_scheduled_publications set state='failed',
          error_code='schedule_attempt_limit',updated_at=now() where post_id=stale.post_id;
        update social_private.x_scheduled_publication_payloads
          set claim_token=null,claim_expires_at=null,next_check_at=null
          where post_id=stale.post_id;
      else
        update public.social_x_scheduled_publications set state='queued',
          error_code=null,updated_at=now() where post_id=stale.post_id;
        update social_private.x_scheduled_publication_payloads set
          next_check_at=now()+interval '1 minute',
          claim_token=null,claim_expires_at=null where post_id=stale.post_id;
      end if;
    else
      update public.social_x_scheduled_publications set state='unknown',
        error_code='unknown_result',updated_at=now() where post_id=stale.post_id;
    end if;
  end loop;

  update public.social_x_scheduled_publications s set state='failed',
    error_code='schedule_attempt_limit',updated_at=now()
  from social_private.x_scheduled_publication_payloads payload_row
  where payload_row.post_id=s.post_id and s.state='claimed' and payload_row.claim_token is null
    and payload_row.claim_count>=12 and coalesce(payload_row.next_check_at,s.scheduled_at)<=now();

  with candidate as (
    select s.post_id from public.social_x_scheduled_publications s
    join social_private.x_scheduled_publication_payloads p using(post_id)
    where (s.state='queued' and s.scheduled_at<=now()
        and coalesce(p.next_check_at,s.scheduled_at)<=now())
      or (s.state='claimed' and p.claim_token is null and p.next_check_at<=now())
    order by s.scheduled_at,s.post_id
    for update of s,p skip locked limit 1
  ), claimed as (
    update public.social_x_scheduled_publications s set
      state='claimed',error_code=null,updated_at=now()
    from candidate c where s.post_id=c.post_id returning s.*
  )
  update social_private.x_scheduled_publication_payloads p set
    claim_token=gen_random_uuid(),claim_expires_at=now()+interval '4 minutes',
    claim_count=p.claim_count+1
  from claimed c where p.post_id=c.post_id
  returning jsonb_build_object(
    'postId',c.post_id,'workspaceId',c.workspace_id,'scheduledAt',c.scheduled_at,
    'claimToken',p.claim_token,'requestId',p.request_id,'userId',p.user_id,
    'integrationId',p.integration_id,'connectionRevision',p.connection_revision,
    'accountId',p.account_id,'scopes',p.scopes,'expected',p.expected,
    'claimCount',p.claim_count
  ) into result;
  return result;
end;
$$;

create function public.social_x_schedule_connection(p_post uuid,p_claim uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.social_x_scheduled_publications; p social_private.x_scheduled_publication_payloads;
  connection jsonb; integration public.social_integrations; binding_fingerprint text;
begin
  select * into s from public.social_x_scheduled_publications where post_id=p_post for update;
  select * into p from social_private.x_scheduled_publication_payloads where post_id=p_post for update;
  if s.post_id is null or s.state<>'claimed' or p.claim_token is distinct from p_claim
    or p.claim_expires_at<=now() then raise exception 'busy'; end if;
  if not social_private.x_schedule_is_enabled() then raise exception 'schedule_not_ready'; end if;
  connection=social_private.x_publish_connection_state(s.workspace_id,p.user_id);
  select * into integration from public.social_integrations
    where id=(connection->>'integrationId')::uuid and workspace_id=s.workspace_id and channel='x';
  if integration.id is null or integration.id<>p.integration_id
    or connection->>'accountId' is distinct from p.account_id
    or integration.scopes is distinct from p.scopes
    or integration.status<>'configured' then raise exception 'schedule_connection_changed'; end if;
  binding_fingerprint=social_private.x_schedule_connection_binding(
    s.workspace_id,p.user_id,integration.id,connection->>'accountId');
  if binding_fingerprint is distinct from p.connection_fingerprint
    then raise exception 'schedule_connection_changed'; end if;
  if jsonb_array_length(p.expected->'files')>0
    and p.scopes<>'tweet.read tweet.write users.read offline.access media.write'
    then raise exception 'media_permission_required'; end if;
  return jsonb_build_object('fingerprint',connection->>'fingerprint');
end;
$$;

create function public.social_x_schedule_finish(
  p_post uuid,p_claim uuid,p_state text,p_error text default null,p_next_check timestamptz default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare s public.social_x_scheduled_publications; p social_private.x_scheduled_publication_payloads;
  attempt public.social_x_publication_attempts; valid_error text[] = array[
    'invalid_request','forbidden','not_connected','not_configured','busy','stale_snapshot',
    'unsupported_media','publication_locked','already_published','media_expired','storage_failed',
    'invalid_text','media_too_large','invalid_media','media_failed','provider_unavailable',
    'authorization_failed','invalid_token','rate_limited','provider_rejected','unknown_result',
    'invalid_state','media_permission_required','schedule_connection_changed',
    'schedule_attempt_limit','schedule_not_ready','schedule_cancelled',
    'schedule_media_checkpoint_incomplete'
  ];
begin
  if p_post is null or p_claim is null or p_state not in ('published','failed','unknown','waiting')
    or (p_error is not null and not p_error=any(valid_error))
    or (p_state='waiting' and (p_error is not null or p_next_check is null))
    or (p_state<>'waiting' and p_next_check is not null)
    then raise exception 'invalid_request'; end if;
  select * into s from public.social_x_scheduled_publications where post_id=p_post for update;
  select * into p from social_private.x_scheduled_publication_payloads where post_id=p_post for update;
  if s.post_id is null or p.post_id is null or p.claim_token is distinct from p_claim
    then raise exception 'busy'; end if;
  if s.state in ('published','failed','cancelled') then
    if p_state='published' and s.state='published' then return true; end if;
    if p_state='failed' and s.state='failed' and s.error_code is not distinct from p_error then return true; end if;
    raise exception 'busy';
  end if;
  if s.state not in ('claimed','sending','unknown') then raise exception 'busy'; end if;
  select * into attempt from public.social_x_publication_attempts
    where post_id=p_post and request_id=p.request_id for update;

  if p_state='waiting' then
    if s.state<>'claimed' or (attempt.id is not null and attempt.state<>'preparing')
      or p_next_check<now()-interval '1 minute' or p_next_check>now()+interval '1 day'
      then raise exception 'invalid_request'; end if;
    if p.claim_count>=12 then
      if attempt.id is not null and attempt.state='preparing' then
        update public.social_x_publication_attempts set state='rejected',
          error_code='schedule_attempt_limit',updated_at=now()
          where id=attempt.id and state='preparing';
        update social_private.x_publication_payloads set lease=null,lease_expires_at=null
          where attempt_id=attempt.id;
      end if;
      update public.social_x_scheduled_publications set state='failed',
        error_code='schedule_attempt_limit',updated_at=now() where post_id=p_post;
      update social_private.x_scheduled_publication_payloads set
        next_check_at=null,claim_token=null,claim_expires_at=null where post_id=p_post;
    else
      -- A released lease is a queued job, not active processing. This keeps
      -- cancellation available while waiting for a transient pre-send retry.
      update public.social_x_scheduled_publications set state='queued',error_code=null,updated_at=now()
        where post_id=p_post;
      update social_private.x_scheduled_publication_payloads set next_check_at=p_next_check,
        claim_token=null,claim_expires_at=null where post_id=p_post;
    end if;
    return true;
  elsif p_state='published' then
    if attempt.id is null or attempt.state<>'published' or attempt.remote_post_id is null
      then raise exception 'invalid_request'; end if;
    update public.social_x_scheduled_publications set state='published',
      remote_post_id=attempt.remote_post_id,error_code=null,updated_at=now() where post_id=p_post;
    return true;
  elsif p_state='failed' then
    if attempt.id is not null and attempt.state<>'rejected' then raise exception 'invalid_request'; end if;
    update public.social_x_scheduled_publications set state='failed',
      remote_post_id=null,error_code=coalesce(p_error,'provider_rejected'),updated_at=now() where post_id=p_post;
    return true;
  else
    if attempt.id is not null and attempt.state not in ('sending','unknown')
      then raise exception 'invalid_request'; end if;
    update public.social_x_scheduled_publications set state='unknown',
      remote_post_id=null,error_code=coalesce(p_error,'unknown_result'),updated_at=now() where post_id=p_post;
    return true;
  end if;
end;
$$;

-- The shared X publisher's finish RPC predates scheduled publishing. Extend
-- only its safe error allowlist so the database can persist a definitively
-- pre-send scheduler-not-ready receipt without rewriting the already-applied
-- manual-publishing migration.
create or replace function public.social_x_publish_finish(
  p_attempt uuid,p_lease uuid,p_state text,p_remote text,p_error text
) returns boolean language plpgsql security definer set search_path='' as $$
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
      'invalid_state','media_permission_required','schedule_not_ready','schedule_cancelled'))
    then raise exception 'invalid_request'; end if;
  select p.post_id into locked_post_id
    from public.social_x_publication_attempts p where p.id=p_attempt;
  perform 1 from public.social_posts where id=locked_post_id for update;
  select * into a from public.social_x_publication_attempts where id=p_attempt for update;
  select * into payload from social_private.x_publication_payloads where attempt_id=p_attempt for update;
  if a.id is null then raise exception 'invalid_request'; end if;
  -- Durable dispatch lease is retained even after a stale sending receipt becomes unknown.
  if (a.state in ('sending','unknown','published') and payload.sending_lease is distinct from p_lease)
    or (a.state in ('preparing','rejected') and payload.lease is distinct from p_lease)
    then raise exception 'busy'; end if;
  if a.state=p_state and a.remote_post_id is not distinct from p_remote
    and a.error_code is not distinct from p_error then return true; end if;
  if a.state='preparing' and (p_state<>'rejected' or payload.lease_expires_at<=now())
    then raise exception 'invalid_request'; end if;
  if a.state not in ('preparing','sending','unknown')
    or (a.state='unknown' and p_state<>'published') then raise exception 'invalid_request'; end if;
  -- Preserve durable success receipts even if authorization/config changed
  -- after dispatch; this is otherwise the existing publisher contract.
  update public.social_x_publication_attempts set state=p_state,remote_post_id=p_remote,
    error_code=p_error,updated_at=now() where id=a.id returning * into a;
  if p_state='published' and not exists(select 1 from public.social_post_channels
    where post_id=a.post_id and channel<>'x')
    then update public.social_posts set status='published',updated_at=now() where id=a.post_id; end if;
  return true;
end;
$$;

create function social_private.x_schedule_safe_error(p_code text) returns boolean
language sql immutable set search_path='' as $$
  select p_code=any(array[
    'invalid_request','forbidden','not_connected','not_configured','busy','stale_snapshot',
    'unsupported_media','publication_locked','already_published','media_expired','storage_failed',
    'invalid_text','media_too_large','invalid_media','media_failed','provider_unavailable',
    'authorization_failed','invalid_token','rate_limited','provider_rejected','unknown_result',
    'invalid_state','media_permission_required','schedule_connection_changed',
    'schedule_attempt_limit','schedule_not_ready','schedule_cancelled',
    'schedule_media_checkpoint_incomplete'
  ]);
$$;

revoke all on function social_private.x_schedule_is_enabled(),
  social_private.x_schedule_blocked(uuid),
  social_private.x_schedule_post_fence(),social_private.x_schedule_child_fence(),
  social_private.x_schedule_storage_fence(),social_private.x_schedule_attempt_fence(),
  social_private.x_schedule_attempt_sending(),social_private.x_schedule_safe_error(text),
  social_private.x_schedule_connection_binding(uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function public.social_x_schedule_is_ready(uuid),
  public.social_x_schedule_enqueue(uuid,uuid,jsonb),
  public.social_x_schedule_cancel(uuid),public.social_x_schedule_claim_due(),
  public.social_x_schedule_connection(uuid,uuid),
  public.social_x_schedule_finish(uuid,uuid,text,text,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.social_x_schedule_is_ready(uuid),
  public.social_x_schedule_enqueue(uuid,uuid,jsonb),
  public.social_x_schedule_cancel(uuid) to authenticated;
grant execute on function public.social_x_schedule_claim_due(),
  public.social_x_schedule_connection(uuid,uuid),
  public.social_x_schedule_finish(uuid,uuid,text,text,timestamptz) to service_role;
