-- Synthetic isolated PostgreSQL assertions only; never run against production.
-- Depends on the helpers/roles created by tests/x-publish-assertions.sql.
reset role;
select set_config('request.jwt.claim.sub','',false);

create function public.test_x_schedule_expected(p_post uuid,p_files uuid[],p_user uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare post public.social_posts; files jsonb; connection jsonb;
begin
  select * into post from public.social_posts where id=p_post;
  files=social_private.x_publish_snapshot(post.id,post.workspace_id,p_files);
  select coalesce(jsonb_agg(value||jsonb_build_object('sha256',repeat('a',64)) order by ordinality),'[]'::jsonb)
    into files from jsonb_array_elements(files) with ordinality;
  connection=social_private.x_publish_connection_state(post.workspace_id,coalesce(p_user,post.created_by));
  return jsonb_build_object('body',post.body,'files',files,'connectionFingerprint',connection->>'fingerprint');
end $$;

-- The production migration intentionally denies even service_role direct
-- access to private queue payloads. These narrowly scoped helpers exist only
-- in the synthetic database so worker-state fixtures can move retry clocks.
create function public.test_x_schedule_expire_claim(p_post uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  update social_private.x_scheduled_publication_payloads
    set claim_expires_at=now()-interval '1 second'
    where post_id=p_post and claim_token is not null;
  if not found then raise exception 'Synthetic X schedule claim lease is missing'; end if;
  update social_private.x_publication_payloads payload
    set lease_expires_at=now()-interval '1 second'
    where payload.attempt_id in (
      select attempt.id from public.social_x_publication_attempts attempt where attempt.post_id=p_post
    );
end $$;
revoke all on function public.test_x_schedule_expire_claim(uuid) from public,anon,authenticated;
grant execute on function public.test_x_schedule_expire_claim(uuid) to service_role;

create function public.test_x_schedule_make_due(p_post uuid)
returns void language sql security definer set search_path='' as $$
  update social_private.x_scheduled_publication_payloads
    set next_check_at=now()-interval '1 second' where post_id=p_post
$$;
revoke all on function public.test_x_schedule_make_due(uuid) from public,anon,authenticated;
grant execute on function public.test_x_schedule_make_due(uuid) to service_role;

create function public.test_x_schedule_snapshot(p_post uuid,p_request uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'state',(select schedule.state from public.social_x_scheduled_publications schedule
      where schedule.post_id=p_post),
    'requestId',(select payload.request_id from social_private.x_scheduled_publication_payloads payload
      where payload.post_id=p_post),
    'requestTombstoned',exists(
      select 1 from social_private.x_scheduled_publication_request_tombstones tombstone
      where tombstone.post_id=p_post and tombstone.request_id=p_request
    ),
    'errorCode',(select schedule.error_code from public.social_x_scheduled_publications schedule
      where schedule.post_id=p_post),
    'attemptState',(select attempt.state from public.social_x_publication_attempts attempt
      where attempt.post_id=p_post order by attempt.created_at desc limit 1),
    'attemptError',(select attempt.error_code from public.social_x_publication_attempts attempt
      where attempt.post_id=p_post order by attempt.created_at desc limit 1),
    'attemptId',(select attempt.id from public.social_x_publication_attempts attempt
      where attempt.post_id=p_post order by attempt.created_at desc limit 1),
    'media',(select payload.media from social_private.x_publication_payloads payload
      where payload.attempt_id=(select attempt.id from public.social_x_publication_attempts attempt
        where attempt.post_id=p_post order by attempt.created_at desc limit 1)),
    'hasLease',coalesce((select payload.lease is not null
      from social_private.x_publication_payloads payload
      where payload.attempt_id=(select attempt.id from public.social_x_publication_attempts attempt
        where attempt.post_id=p_post order by attempt.created_at desc limit 1)),false),
    'leaseExpiresAt',(select payload.lease_expires_at
      from social_private.x_publication_payloads payload
      where payload.attempt_id=(select attempt.id from public.social_x_publication_attempts attempt
        where attempt.post_id=p_post order by attempt.created_at desc limit 1)),
    'claimToken',(select payload.claim_token from social_private.x_scheduled_publication_payloads payload
      where payload.post_id=p_post),
    'claimExpiresAt',(select payload.claim_expires_at
      from social_private.x_scheduled_publication_payloads payload where payload.post_id=p_post),
    'nextCheckAt',(select payload.next_check_at from social_private.x_scheduled_publication_payloads payload
      where payload.post_id=p_post)
  )
$$;
revoke all on function public.test_x_schedule_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.test_x_schedule_snapshot(uuid,uuid) to service_role;

do $$
declare
  w uuid='10000000-0000-4000-8000-000000000089';
  owner_id uuid='00000000-0000-4000-8000-000000000002';
  member_id uuid='00000000-0000-4000-8000-000000000003';
  viewer_id uuid='00000000-0000-4000-8000-000000000004';
  global_admin uuid='00000000-0000-4000-8000-000000000005';
  post_media uuid='20000000-0000-4000-8000-000000000095';
  post_multi uuid='20000000-0000-4000-8000-000000000096';
  post_cancel uuid='20000000-0000-4000-8000-000000000097';
  post_claim_race uuid='20000000-0000-4000-8000-000000000098';
  post_cancel_race uuid='20000000-0000-4000-8000-000000000099';
  post_enqueue_race uuid='20000000-0000-4000-8000-000000000100';
  post_partial_checkpoint uuid='20000000-0000-4000-8000-000000000101';
  post_complete_checkpoint uuid='20000000-0000-4000-8000-000000000102';
  post_wait_limit uuid='20000000-0000-4000-8000-000000000103';
  post_stale_limit uuid='20000000-0000-4000-8000-000000000104';
  post_request_fence uuid='20000000-0000-4000-8000-000000000105';
  post_dispatch_race uuid='20000000-0000-4000-8000-000000000106';
  post_refresh_binding uuid='20000000-0000-4000-8000-000000000107';
  file_id uuid='50000000-0000-4000-8000-000000000095';
  cancel_race_file uuid='50000000-0000-4000-8000-000000000099';
  partial_file_1 uuid='50000000-0000-4000-8000-000000000101';
  partial_file_2 uuid='50000000-0000-4000-8000-000000000102';
  complete_file uuid='50000000-0000-4000-8000-000000000103';
  wait_limit_file uuid='50000000-0000-4000-8000-000000000104';
  integration uuid; expected jsonb; result jsonb; request_id uuid=gen_random_uuid();
begin
  if has_table_privilege('anon','public.social_x_scheduled_publications','SELECT')
    or has_table_privilege('authenticated','public.social_x_scheduled_publications','INSERT')
    or has_table_privilege('authenticated','public.social_x_scheduled_publications','UPDATE')
    or has_table_privilege('authenticated','public.social_x_scheduled_publications','DELETE')
    or has_table_privilege('service_role','public.social_x_scheduled_publications','UPDATE')
    or has_table_privilege('authenticated','social_private.x_scheduled_publication_payloads','SELECT')
    or has_table_privilege('service_role','social_private.x_scheduled_publication_payloads','SELECT')
    then raise exception 'X schedule table privilege leak'; end if;
  if has_function_privilege('anon','public.social_x_schedule_claim_due()','EXECUTE')
    or has_function_privilege('authenticated','public.social_x_schedule_claim_due()','EXECUTE')
    or not has_function_privilege('service_role','public.social_x_schedule_claim_due()','EXECUTE')
    then raise exception 'X schedule worker RPC privilege leak'; end if;
  if has_function_privilege('anon','public.social_x_schedule_enqueue(uuid,uuid,jsonb)','EXECUTE')
    or not has_function_privilege('authenticated','public.social_x_schedule_enqueue(uuid,uuid,jsonb)','EXECUTE')
    or has_function_privilege('service_role','public.social_x_schedule_cancel(uuid)','EXECUTE')
    then raise exception 'X schedule user RPC privilege mismatch'; end if;
  if has_function_privilege('anon','social_private.x_schedule_connection_binding(uuid,uuid,uuid,text)','EXECUTE')
    or has_function_privilege('authenticated','social_private.x_schedule_connection_binding(uuid,uuid,uuid,text)','EXECUTE')
    or has_function_privilege('service_role','social_private.x_schedule_connection_binding(uuid,uuid,uuid,text)','EXECUTE')
    then raise exception 'X schedule private connection-binding helper privilege leak'; end if;

  insert into public.social_workspaces(id,name,created_by)
    values(w,'Synthetic X schedule workspace',owner_id);
  insert into public.social_workspace_members(workspace_id,user_id,role) values
    (w,member_id,'member'),(w,viewer_id,'viewer');
  insert into public.social_posts(id,workspace_id,title,body,status,scheduled_at,created_by)
    values
      (post_media,w,'Synthetic media schedule','Synthetic body','scheduled',now()+interval '1 hour',owner_id),
      (post_multi,w,'Synthetic multichannel schedule','Synthetic body','scheduled',now()+interval '1 hour',owner_id),
      (post_cancel,w,'Synthetic cancel schedule','Synthetic body','scheduled',now()+interval '1 hour',owner_id),
      (post_claim_race,w,'Synthetic claim race','Synthetic body','scheduled',now()+interval '1 hour',owner_id),
      (post_cancel_race,w,'Synthetic cancel race','Synthetic body','scheduled',now()+interval '1 hour',owner_id),
      (post_enqueue_race,w,'Synthetic enqueue race','Synthetic body','scheduled',now()+interval '1 hour',owner_id),
      (post_partial_checkpoint,w,'Synthetic partial media checkpoint','Synthetic body','scheduled',now()+interval '1 hour',owner_id),
      (post_complete_checkpoint,w,'Synthetic complete media checkpoint','Synthetic body','scheduled',now()+interval '1 hour',owner_id),
      (post_wait_limit,w,'Synthetic wait attempt limit','Synthetic body','scheduled',now()+interval '1 hour',owner_id),
      (post_stale_limit,w,'Synthetic stale attempt limit','Synthetic body','scheduled',now()+interval '1 hour',owner_id),
      (post_request_fence,w,'Synthetic request fence','Synthetic body','scheduled',now()+interval '1 hour',owner_id),
      (post_dispatch_race,w,'Synthetic dispatch race','Synthetic body','scheduled',now()+interval '1 hour',owner_id),
      (post_refresh_binding,w,'Synthetic token refresh binding','Synthetic body','scheduled',now()+interval '1 hour',owner_id);
  insert into public.social_post_channels(post_id,channel)
    values(post_media,'x'),(post_multi,'x'),(post_multi,'instagram'),
      (post_cancel,'x'),(post_claim_race,'x'),(post_cancel_race,'x'),(post_enqueue_race,'x'),
      (post_partial_checkpoint,'x'),(post_complete_checkpoint,'x'),
      (post_wait_limit,'x'),(post_stale_limit,'x'),(post_request_fence,'x'),
      (post_dispatch_race,'x'),(post_refresh_binding,'x');

  -- A migrated project must remain inert until an operator explicitly enables
  -- the scheduler and the user-facing readiness check must say so.
  perform set_config('request.jwt.claim.sub',owner_id::text,false);
  if social_private.x_schedule_is_enabled()
    or public.social_x_schedule_is_ready(w)
    then raise exception 'X schedule runtime did not start disabled'; end if;
  perform pg_temp.expect_failure(format(
    'select public.social_x_schedule_enqueue(%L,%L,%L)',
    post_cancel,gen_random_uuid(),
    jsonb_build_object('body','Synthetic body','files','[]'::jsonb,
      'connectionFingerprint',repeat('a',64))::text
  ),'schedule_not_ready');
  update social_private.x_schedule_runtime_settings set enabled=true where singleton=true;
  if not public.social_x_schedule_is_ready(w)
    then raise exception 'Enabled X schedule runtime was not reported ready to a member'; end if;

  insert into public.social_post_files(
    id,workspace_id,post_id,storage_path,file_name,content_type,file_size,created_by
  ) values(
    file_id,w,post_media,w||'/'||post_media||'/synthetic.png',
    'synthetic.png','image/png',80,owner_id
  ),(
    cancel_race_file,w,post_cancel_race,w||'/'||post_cancel_race||'/synthetic.mp4',
    'synthetic.mp4','video/mp4',80,owner_id
  ),(
    partial_file_1,w,post_partial_checkpoint,w||'/'||post_partial_checkpoint||'/first.png',
    'first.png','image/png',80,owner_id
  ),(
    partial_file_2,w,post_partial_checkpoint,w||'/'||post_partial_checkpoint||'/second.png',
    'second.png','image/png',80,owner_id
  ),(
    complete_file,w,post_complete_checkpoint,w||'/'||post_complete_checkpoint||'/complete.png',
    'complete.png','image/png',80,owner_id
  ),(
    wait_limit_file,w,post_wait_limit,w||'/'||post_wait_limit||'/limit.png',
    'limit.png','image/png',80,owner_id
  );
  insert into storage.objects(bucket_id,name)
    values('social-post-files',w||'/'||post_media||'/synthetic.png'),
      ('social-post-files',w||'/'||post_cancel_race||'/synthetic.mp4'),
      ('social-post-files',w||'/'||post_partial_checkpoint||'/first.png'),
      ('social-post-files',w||'/'||post_partial_checkpoint||'/second.png'),
      ('social-post-files',w||'/'||post_complete_checkpoint||'/complete.png'),
      ('social-post-files',w||'/'||post_wait_limit||'/limit.png');

  integration=public.social_x_oauth_configure(w,owner_id,'synthetic-client','synthetic-client-secret',
    'tweet.read tweet.write users.read offline.access','https://fixture.invalid/cb');
  perform public.social_x_oauth_begin(w,owner_id,repeat('b',64),'synthetic-verifier');
  perform public.social_x_oauth_claim(repeat('b',64));
  perform public.social_x_oauth_finish(repeat('b',64),'synthetic-access','synthetic-refresh',
    now()+interval '2 hours','888','synthetic');

  perform set_config('request.jwt.claim.sub',owner_id::text,false);
  expected=public.test_x_schedule_expected(post_media,array[file_id],owner_id);
  perform pg_temp.expect_failure(format(
    'select public.social_x_schedule_enqueue(%L,%L,%L)',
    post_media,gen_random_uuid(),expected::text
  ),'media_permission_required');

  -- Upgrade the synthetic fixture's own connection to media.write; this is only
  -- an isolated DB test and does not access or modify production credentials.
  integration=public.social_x_oauth_configure(w,owner_id,'synthetic-client','synthetic-client-secret',
    'tweet.read tweet.write users.read offline.access media.write','https://fixture.invalid/cb');
  perform public.social_x_oauth_begin(w,owner_id,repeat('c',64),'synthetic-verifier');
  perform public.social_x_oauth_claim(repeat('c',64));
  perform public.social_x_oauth_finish(repeat('c',64),'synthetic-access-2','synthetic-refresh-2',
    now()+interval '2 hours','888','synthetic');

  expected=public.test_x_schedule_expected(post_media,array[file_id],owner_id);
  if has_table_privilege('anon','public.social_x_scheduled_publications','SELECT')
    then raise exception 'Anonymous access unexpectedly granted'; end if;

  -- Prepare expected value before assuming an authenticated browser role.
  perform set_config('app.x_schedule_expected',expected::text,false);
  perform set_config('request.jwt.claim.sub',owner_id::text,false);
end $$;

set role authenticated;
do $$
declare
  p uuid='20000000-0000-4000-8000-000000000095';
  p_multi uuid='20000000-0000-4000-8000-000000000096';
  p_cancel uuid='20000000-0000-4000-8000-000000000097';
  p_claim_race uuid='20000000-0000-4000-8000-000000000098';
  p_cancel_race uuid='20000000-0000-4000-8000-000000000099';
  p_request_fence uuid='20000000-0000-4000-8000-000000000105';
  p_dispatch_race uuid='20000000-0000-4000-8000-000000000106';
  cancel_race_file uuid='50000000-0000-4000-8000-000000000099';
  media_file uuid='50000000-0000-4000-8000-000000000095';
  owner_id uuid='00000000-0000-4000-8000-000000000002';
  expected jsonb=current_setting('app.x_schedule_expected')::jsonb;
  result jsonb; schedule_request_id uuid=gen_random_uuid();
  cancel_request_id uuid=gen_random_uuid(); alternate jsonb;
  cancel_race_request_id uuid=gen_random_uuid();
  fence_request_id uuid=gen_random_uuid(); whitespace_body text;
  refresh_request_id uuid;
begin
  -- X requires text even when media is attached. Exercise spaces, tabs, and
  -- newlines against a real synthetic attachment snapshot.
  foreach whitespace_body in array array['   ',E'\t\t',E'\n \r'] loop
    update public.social_posts set body=whitespace_body where id=p;
    alternate=public.test_x_schedule_expected(p,array[media_file],owner_id);
    perform pg_temp.expect_failure(format(
      'select public.social_x_schedule_enqueue(%L,%L,%L)',
      p,gen_random_uuid(),alternate::text
    ),'invalid_text');
  end loop;
  update public.social_posts set body='Synthetic body' where id=p;

  perform pg_temp.expect_failure(format(
    'select public.social_x_schedule_enqueue(%L,%L,%L)',
    p,gen_random_uuid(),jsonb_set(expected,'{connectionFingerprint}',to_jsonb(repeat('0',64)))::text
  ),'stale_snapshot');
  perform pg_temp.expect_failure(format(
    'select public.social_x_schedule_enqueue(%L,%L,%L)',
    p,gen_random_uuid(),jsonb_set(expected,'{body}',to_jsonb('Changed body'::text))::text
  ),'stale_snapshot');
  result=public.social_x_schedule_enqueue(p,schedule_request_id,expected);
  if result->>'state'<>'queued' or (result->>'scheduledAt')::timestamptz<=now()
    then raise exception 'Explicit X-only schedule was not enqueued'; end if;

  -- One same-key RPC may return the existing row, but neither a fresh key nor
  -- a modified payload can replace or duplicate the saved queue entry.
  result=public.social_x_schedule_enqueue(p,schedule_request_id,expected);
  if result->>'state'<>'queued' then raise exception 'Same-key enqueue was not idempotent'; end if;
  perform pg_temp.expect_failure(format(
    'select public.social_x_schedule_enqueue(%L,%L,%L)',p,gen_random_uuid(),expected::text
  ),'schedule_exists');
  perform pg_temp.expect_failure(format(
    'select public.social_x_schedule_enqueue(%L,%L,%L)',
    p,schedule_request_id,jsonb_set(expected,'{body}',to_jsonb('Different body'::text))::text
  ),'schedule_exists');

  perform pg_temp.expect_failure(format('update public.social_posts set body=%L where id=%L','Changed',p),
    'publication_locked');
  perform pg_temp.expect_failure(format('delete from public.social_post_files where post_id=%L',p),
    'publication_locked');
  perform pg_temp.expect_failure(format('update public.social_post_files set file_size=90 where post_id=%L',p),
    'publication_locked');
  perform pg_temp.expect_failure(format('delete from public.social_post_channels where post_id=%L',p),
    'publication_locked');
  perform pg_temp.expect_failure(format(
    'insert into public.social_post_channels(post_id,channel) values(%L,%L)',p,'threads'
  ),'publication_locked');
  perform pg_temp.expect_failure(format(
    'delete from storage.objects where bucket_id=%L and name=%L',
    'social-post-files','10000000-0000-4000-8000-000000000089/'||p||'/synthetic.png'
  ),'publication_locked');
  perform pg_temp.expect_failure(format(
    'update storage.objects set name=%L where bucket_id=%L and name=%L',
    'moved/file','social-post-files','10000000-0000-4000-8000-000000000089/'||p||'/synthetic.png'
  ),'publication_locked');

  -- An ordinary reservation is not automatically queued; only an explicit
  -- enqueue on a single-X post creates a row.
  alternate=public.test_x_schedule_expected(p_multi,'{}',owner_id);
  perform pg_temp.expect_failure(format(
    'select public.social_x_schedule_enqueue(%L,%L,%L)',
    p_multi,gen_random_uuid(),alternate::text
  ),'invalid_request');
  if exists(select 1 from public.social_x_scheduled_publications where post_id=p_multi)
    then raise exception 'Multi-channel saved reservation entered X queue'; end if;

  -- A separate explicitly opted-in reservation is used by the cancellation
  -- path and must return to an editable draft atomically.
  alternate=public.test_x_schedule_expected(p_cancel,'{}',owner_id);
  cancel_request_id=gen_random_uuid();
  result=public.social_x_schedule_enqueue(p_cancel,cancel_request_id,alternate);
  if result->>'state'<>'queued' then raise exception 'Cancellation fixture enqueue failed'; end if;
  result=public.social_x_schedule_cancel(p_cancel);
  if result->>'state'<>'cancelled' then raise exception 'Queued X reservation did not cancel'; end if;
  result=public.social_x_schedule_cancel(p_cancel);
  if result->>'state'<>'cancelled' then raise exception 'Cancel retry was not idempotent'; end if;
  perform pg_temp.expect_failure(format(
    'select public.social_x_schedule_enqueue(%L,%L,%L)',
    p_cancel,cancel_request_id,alternate::text
  ),'schedule_cancelled');
  update public.social_posts
    set status='scheduled',scheduled_at=now()+interval '1 hour'
    where id=p_cancel and status='draft';
  if not found then raise exception 'Cancelled X post did not return to editable draft'; end if;
  cancel_request_id=gen_random_uuid();
  result=public.social_x_schedule_enqueue(p_cancel,cancel_request_id,alternate);
  if result->>'state'<>'queued' then raise exception 'Fresh request could not requeue the cancelled draft'; end if;
  result=public.social_x_schedule_cancel(p_cancel);
  if result->>'state'<>'cancelled' then raise exception 'Requeued X reservation did not cancel'; end if;
  perform pg_temp.expect_failure(format(
    'select public.social_x_schedule_enqueue(%L,%L,%L)',
    p_cancel,cancel_request_id,alternate::text
  ),'schedule_cancelled');

  alternate=public.test_x_schedule_expected(p_request_fence,'{}',owner_id);
  result=public.social_x_schedule_enqueue(p_request_fence,fence_request_id,alternate);
  if result->>'state'<>'queued' then raise exception 'Request-fence fixture enqueue failed'; end if;
  perform set_config('app.x_schedule_request_id',fence_request_id::text,false);
  alternate=public.test_x_schedule_expected(
    '20000000-0000-4000-8000-000000000107','{}',owner_id);
  refresh_request_id=gen_random_uuid();
  result=public.social_x_schedule_enqueue(
    '20000000-0000-4000-8000-000000000107',refresh_request_id,alternate);
  if result->>'state'<>'queued' then raise exception 'Token-refresh binding fixture enqueue failed'; end if;
  perform set_config('app.x_schedule_refresh_request_id',refresh_request_id::text,false);
  perform set_config('app.x_schedule_refresh_expected',alternate::text,false);

  alternate=public.test_x_schedule_expected(p_claim_race,'{}',owner_id);
  result=public.social_x_schedule_enqueue(p_claim_race,gen_random_uuid(),alternate);
  if result->>'state'<>'queued' then raise exception 'Claim race fixture enqueue failed'; end if;
  alternate=public.test_x_schedule_expected(p_cancel_race,array[cancel_race_file],owner_id);
  result=public.social_x_schedule_enqueue(p_cancel_race,cancel_race_request_id,alternate);
  if result->>'state'<>'queued' then raise exception 'Cancel race fixture enqueue failed'; end if;

  alternate=public.test_x_schedule_expected(
    '20000000-0000-4000-8000-000000000101',
    array['50000000-0000-4000-8000-000000000101'::uuid,
      '50000000-0000-4000-8000-000000000102'::uuid],owner_id);
  result=public.social_x_schedule_enqueue(
    '20000000-0000-4000-8000-000000000101',gen_random_uuid(),alternate);
  if result->>'state'<>'queued' then raise exception 'Partial checkpoint fixture enqueue failed'; end if;
  alternate=public.test_x_schedule_expected(
    '20000000-0000-4000-8000-000000000102',
    array['50000000-0000-4000-8000-000000000103'::uuid],owner_id);
  result=public.social_x_schedule_enqueue(
    '20000000-0000-4000-8000-000000000102',gen_random_uuid(),alternate);
  if result->>'state'<>'queued' then raise exception 'Complete checkpoint fixture enqueue failed'; end if;
  alternate=public.test_x_schedule_expected(
    '20000000-0000-4000-8000-000000000103',
    array['50000000-0000-4000-8000-000000000104'::uuid],owner_id);
  result=public.social_x_schedule_enqueue(
    '20000000-0000-4000-8000-000000000103',gen_random_uuid(),alternate);
  if result->>'state'<>'queued' then raise exception 'Waiting attempt-limit fixture enqueue failed'; end if;
  alternate=public.test_x_schedule_expected(
    '20000000-0000-4000-8000-000000000104','{}',owner_id);
  result=public.social_x_schedule_enqueue(
    '20000000-0000-4000-8000-000000000104',gen_random_uuid(),alternate);
  if result->>'state'<>'queued' then raise exception 'Stale attempt-limit fixture enqueue failed'; end if;
  alternate=public.test_x_schedule_expected(p_dispatch_race,'{}',owner_id);
  result=public.social_x_schedule_enqueue(p_dispatch_race,gen_random_uuid(),alternate);
  if result->>'state'<>'queued' then raise exception 'Dispatch race fixture enqueue failed'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);

-- Rotating OAuth tokens must not invalidate an explicitly queued X request.
-- The browser's old volatile fingerprint is accepted only for same-request
-- idempotency; the worker then validates the stable client/account binding.
set role service_role;
do $$
declare
  w uuid='10000000-0000-4000-8000-000000000089';
  owner_id uuid='00000000-0000-4000-8000-000000000002';
  p uuid='20000000-0000-4000-8000-000000000107';
  request_id uuid=current_setting('app.x_schedule_refresh_request_id')::uuid;
  lease uuid=gen_random_uuid(); refresh jsonb;
begin
  refresh=public.social_x_oauth_refresh_claim(w,owner_id,lease);
  if refresh->>'accountId' is distinct from '888'
    then raise exception 'Synthetic token refresh returned a different X account'; end if;
  perform public.social_x_oauth_refresh_finish(
    (refresh->>'integrationId')::uuid,owner_id,lease,
    (refresh->>'revision')::uuid,(refresh->>'version')::bigint,
    'scheduled-refreshed-access','scheduled-refreshed-refresh',
    now()+interval '2 hours',refresh->>'accountId',refresh->>'accountUsername'
  );
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
set role authenticated;
do $$
declare
  p uuid='20000000-0000-4000-8000-000000000107';
  request_id uuid=current_setting('app.x_schedule_refresh_request_id')::uuid;
  expected jsonb=current_setting('app.x_schedule_refresh_expected')::jsonb;
  result jsonb;
begin
  result=public.social_x_schedule_enqueue(p,request_id,expected);
  if result->>'state'<>'queued'
    then raise exception 'Same-request retry failed after OAuth token refresh'; end if;
end $$;
reset role;
update public.social_x_scheduled_publications
  set scheduled_at=now()-interval '1 second' where post_id='20000000-0000-4000-8000-000000000107';
update social_private.x_scheduled_publication_payloads
  set next_check_at=now()-interval '1 second' where post_id='20000000-0000-4000-8000-000000000107';
set role service_role;
do $$
declare
  p uuid='20000000-0000-4000-8000-000000000107';
  original_expected jsonb=current_setting('app.x_schedule_refresh_expected')::jsonb;
  result jsonb; connection jsonb; claim uuid;
begin
  result=public.social_x_schedule_claim_due();
  if result->>'postId' is distinct from p::text
    then raise exception 'Token-refresh reservation was not claimed'; end if;
  claim=(result->>'claimToken')::uuid;
  connection=public.social_x_schedule_connection(p,claim);
  if connection->>'fingerprint' is null
    or connection->>'fingerprint' is not distinct from original_expected->>'connectionFingerprint'
    then raise exception 'Worker did not validate the refreshed connection fingerprint'; end if;
  if not public.social_x_schedule_finish(
    p,claim,'waiting',null,now()+interval '1 minute'
  ) then raise exception 'Token-refresh fixture could not release its claim'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
set role authenticated;
select public.social_x_schedule_cancel('20000000-0000-4000-8000-000000000107');
reset role;
select set_config('request.jwt.claim.sub','',false);

-- A no-attempt expired claim returns to the queue with its original request ID.
-- Once cancelled, that old ID is fenced from manual publication while a fresh
-- explicit manual request remains available for the restored draft.
update public.social_x_scheduled_publications set scheduled_at=now()-interval '1 minute'
  where post_id='20000000-0000-4000-8000-000000000105';
set role service_role;
select public.test_x_schedule_make_due('20000000-0000-4000-8000-000000000105');
do $$
declare
  p uuid='20000000-0000-4000-8000-000000000105';
  old_request uuid=current_setting('app.x_schedule_request_id')::uuid;
  result jsonb; snapshot jsonb;
begin
  result=public.social_x_schedule_claim_due();
  if result is null or result->>'postId' is distinct from p::text
    or result->>'requestId' is distinct from old_request::text
    then raise exception 'Request-fence reservation was not claimed with its saved request ID'; end if;
  perform public.test_x_schedule_expire_claim(p);
  result=public.social_x_schedule_claim_due();
  snapshot=public.test_x_schedule_snapshot(p);
  if result is not null or snapshot->>'state'<>'queued'
    or snapshot->>'claimToken' is not null
    or (snapshot->>'nextCheckAt')::timestamptz<=now()
    or snapshot->>'requestId' is distinct from old_request::text
    then raise exception 'Expired claim did not preserve the same request behind retry backoff'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
set role authenticated;
do $$
declare p uuid='20000000-0000-4000-8000-000000000105'; result jsonb;
begin
  result=public.social_x_schedule_cancel(p);
  if result->>'state'<>'cancelled'
    or (select status from public.social_posts where id=p)<>'draft'
    or (select state from public.social_x_scheduled_publications where post_id=p)<>'cancelled'
    then raise exception 'Requeued request-fence reservation did not cancel'; end if;
end $$;
reset role;
set role service_role;
do $$
declare
  p uuid='20000000-0000-4000-8000-000000000105';
  owner_id uuid='00000000-0000-4000-8000-000000000002';
  old_request uuid=current_setting('app.x_schedule_request_id')::uuid;
  fresh_request uuid=gen_random_uuid(); fresh_lease uuid=gen_random_uuid();
  expected jsonb; result jsonb; snapshot jsonb; attempt_id uuid;
begin
  snapshot=public.test_x_schedule_snapshot(p,old_request);
  if snapshot->>'requestTombstoned'<>'true'
    then raise exception 'Cancelled scheduled request ID was not tombstoned'; end if;
  expected=public.test_x_schedule_expected(p,'{}',owner_id);
  perform pg_temp.expect_failure(format(
    'select public.social_x_publish_prepare(%L::uuid,%L::uuid,%L::uuid,array[]::uuid[],%L::uuid,%L::jsonb)',
    p,owner_id,old_request,fresh_lease,expected::text
  ),'schedule_cancelled');

  result=public.social_x_publish_prepare(
    p,owner_id,fresh_request,array[]::uuid[],fresh_lease,expected
  );
  if result->>'state'<>'preparing' or result->>'claimed'<>'true'
    then raise exception 'Fresh manual request ID was blocked after cancellation'; end if;
  attempt_id=(result->>'attemptId')::uuid;
  if not public.social_x_publish_finish(
    attempt_id,fresh_lease,'rejected',null,'schedule_not_ready')
    then raise exception 'Shared publication finish did not persist schedule_not_ready'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);

-- Recreate the worker's database-only media wait: after a pending X media ID
-- and expiry checkpoint are persisted, finish releases the schedule claim
-- back to queued for later polling without discarding the publication attempt.
reset role;
update public.social_x_scheduled_publications set scheduled_at=now()-interval '1 minute'
  where post_id='20000000-0000-4000-8000-000000000099';
update social_private.x_scheduled_publication_payloads set next_check_at=now()-interval '1 minute'
  where post_id='20000000-0000-4000-8000-000000000099';
set role service_role;
do $$
declare
  p uuid='20000000-0000-4000-8000-000000000099';
  file_id uuid='50000000-0000-4000-8000-000000000099';
  owner_id uuid='00000000-0000-4000-8000-000000000002';
  expected jsonb; result jsonb; claim_id uuid; schedule_request_id uuid;
  publication_attempt_id uuid; publish_lease uuid=gen_random_uuid();
begin
  result=public.social_x_schedule_claim_due();
  if result->>'postId'<>p::text
    then raise exception 'Video wait fixture was not claimed'; end if;
  claim_id=(result->>'claimToken')::uuid;
  schedule_request_id=(result->>'requestId')::uuid;
  expected=public.test_x_schedule_expected(p,array[file_id],owner_id);
  perform public.social_x_schedule_connection(p,claim_id);
  result=public.social_x_publish_prepare(
    p,owner_id,schedule_request_id,array[file_id],publish_lease,expected
  );
  if result->>'state'<>'preparing' or result->>'claimed'<>'true'
  then raise exception 'Video wait fixture did not create a preparing publication attempt'; end if;
  publication_attempt_id=(result->>'attemptId')::uuid;
  perform public.social_x_publish_media(
    publication_attempt_id,owner_id,publish_lease,
    jsonb_build_array(jsonb_build_object(
      'id','700099','state','pending',
      'expiresAt',now()+interval '1 hour',
      'nextCheckAt',now()+interval '5 seconds'
    )),false
  );
  if not exists(select 1 from social_private.x_publication_payloads payload
      where payload.attempt_id=publication_attempt_id and payload.media->0->>'id'='700099'
        and payload.media->0->>'state'='pending'
        and (payload.media->0->>'expiresAt')::timestamptz>now())
    then raise exception 'Synthetic pending X media checkpoint was not stored'; end if;
  if not public.social_x_schedule_finish(
      p,claim_id,'waiting',null,now()+interval '5 minutes')
    then raise exception 'Video wait fixture was not released back to the queue'; end if;
end $$;
reset role;
do $$
declare
  p uuid='20000000-0000-4000-8000-000000000099';
begin
  if (select state from public.social_x_scheduled_publications where post_id=p)<>'queued'
    or (select state from public.social_x_publication_attempts where post_id=p)<>'preparing'
    or (select claim_token from social_private.x_scheduled_publication_payloads where post_id=p) is not null
    or not exists(select 1 from public.social_x_publication_attempts attempt
      join social_private.x_publication_payloads payload on payload.attempt_id=attempt.id
      where attempt.post_id=p and payload.media->0->>'id'='700099'
        and payload.media->0->>'state'='pending'
        and (payload.media->0->>'expiresAt')::timestamptz>now())
    then raise exception 'Video wait fixture is not queued with a preparing attempt'; end if;
end $$;
select set_config('request.jwt.claim.sub','',false);

-- A complete persisted media checkpoint may be resumed with the same request
-- after a worker lease expires; its provider media ID must not be replaced.
update public.social_x_scheduled_publications
  set scheduled_at=now()-interval '1 minute'
  where post_id='20000000-0000-4000-8000-000000000102';
update social_private.x_scheduled_publication_payloads
  set next_check_at=now()-interval '1 minute'
  where post_id='20000000-0000-4000-8000-000000000102';
set role service_role;
do $$
declare
  p uuid='20000000-0000-4000-8000-000000000102';
  file_id uuid='50000000-0000-4000-8000-000000000103';
  owner_id uuid='00000000-0000-4000-8000-000000000002';
  expected jsonb; result jsonb; checkpoint jsonb; claim_id uuid;
  request_id uuid; attempt_uuid uuid; publish_lease uuid; snapshot jsonb;
begin
  result=public.social_x_schedule_claim_due();
  if result->>'postId'<>p::text then raise exception 'Complete checkpoint fixture was not claimed'; end if;
  claim_id=(result->>'claimToken')::uuid;
  request_id=(result->>'requestId')::uuid;
  expected=public.test_x_schedule_expected(p,array[file_id],owner_id);
  perform public.social_x_schedule_connection(p,claim_id);
  publish_lease=gen_random_uuid();
  result=public.social_x_publish_prepare(p,owner_id,request_id,array[file_id],publish_lease,expected);
  if result->>'state'<>'preparing' or result->>'claimed'<>'true'
    then raise exception 'Complete checkpoint fixture did not prepare'; end if;
  attempt_uuid=(result->>'attemptId')::uuid;
  checkpoint=jsonb_build_array(jsonb_build_object(
    'id','700001','state','ready','expiresAt',now()+interval '1 hour'
  ));
  perform public.social_x_publish_media(attempt_uuid,owner_id,publish_lease,checkpoint,false);
  perform public.test_x_schedule_expire_claim(p);

  result=public.social_x_schedule_claim_due();
  if result is not null then raise exception 'Expired complete checkpoint was immediately reclaimed'; end if;
  snapshot=public.test_x_schedule_snapshot(p);
  if snapshot->>'state'<>'queued'
    or snapshot->>'attemptState'<>'preparing'
    or snapshot->'media'<>checkpoint
    or coalesce((snapshot->>'leaseExpiresAt')::timestamptz>now(),false)
    or snapshot->>'claimToken' is not null
    or (snapshot->>'nextCheckAt')::timestamptz<=now()
    then raise exception 'Safe complete checkpoint was not preserved behind retry backoff: %',snapshot; end if;

  perform public.test_x_schedule_make_due(p);
  result=public.social_x_schedule_claim_due();
  if result->>'postId'<>p::text then raise exception 'Complete checkpoint retry was not reclaimed'; end if;
  claim_id=(result->>'claimToken')::uuid;
  publish_lease=gen_random_uuid();
  expected=public.test_x_schedule_expected(p,array[file_id],owner_id);
  perform public.social_x_schedule_connection(p,claim_id);
  result=public.social_x_publish_prepare(p,owner_id,request_id,array[file_id],publish_lease,expected);
  if result->>'state'<>'preparing' or result->>'claimed'<>'true'
    or result->'media'<>checkpoint
    then raise exception 'Same-request retry did not reuse the complete media checkpoint'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);

-- An incomplete checkpoint is terminally failed; it cannot silently upload
-- the missing file again after the worker's lease expires.
update public.social_x_scheduled_publications
  set scheduled_at=now()-interval '1 minute'
  where post_id='20000000-0000-4000-8000-000000000101';
update social_private.x_scheduled_publication_payloads
  set next_check_at=now()-interval '1 minute'
  where post_id='20000000-0000-4000-8000-000000000101';
set role service_role;
do $$
declare
  p uuid='20000000-0000-4000-8000-000000000101';
  files uuid[]=array[
    '50000000-0000-4000-8000-000000000101'::uuid,
    '50000000-0000-4000-8000-000000000102'::uuid
  ];
  owner_id uuid='00000000-0000-4000-8000-000000000002';
  expected jsonb; result jsonb; checkpoint jsonb; claim_id uuid;
  request_id uuid; attempt_uuid uuid; publish_lease uuid; snapshot jsonb;
begin
  result=public.social_x_schedule_claim_due();
  if result->>'postId'<>p::text then raise exception 'Partial checkpoint fixture was not claimed'; end if;
  claim_id=(result->>'claimToken')::uuid;
  request_id=(result->>'requestId')::uuid;
  expected=public.test_x_schedule_expected(p,files,owner_id);
  perform public.social_x_schedule_connection(p,claim_id);
  publish_lease=gen_random_uuid();
  result=public.social_x_publish_prepare(p,owner_id,request_id,files,publish_lease,expected);
  if result->>'state'<>'preparing' or result->>'claimed'<>'true'
    then raise exception 'Partial checkpoint fixture did not prepare'; end if;
  attempt_uuid=(result->>'attemptId')::uuid;
  checkpoint=jsonb_build_array(jsonb_build_object(
    'id','700002','state','pending','expiresAt',now()+interval '1 hour',
    'nextCheckAt',now()+interval '5 seconds'
  ));
  perform public.social_x_publish_media(attempt_uuid,owner_id,publish_lease,checkpoint,false);
  perform public.test_x_schedule_expire_claim(p);

  result=public.social_x_schedule_claim_due();
  snapshot=public.test_x_schedule_snapshot(p);
  if result is not null then raise exception 'Incomplete checkpoint unexpectedly produced another claim'; end if;
  if snapshot->>'state'<>'failed'
    or snapshot->>'errorCode'<>'schedule_media_checkpoint_incomplete'
    or snapshot->>'attemptState'<>'rejected'
    or snapshot->>'attemptError'<>'schedule_media_checkpoint_incomplete'
    or (snapshot->>'hasLease')::boolean
    or snapshot->>'claimToken' is not null
    or snapshot->>'claimExpiresAt' is not null
    then raise exception 'Incomplete media checkpoint did not fail closed and release leases'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
set role authenticated;
do $$
declare p uuid='20000000-0000-4000-8000-000000000101'; result jsonb;
begin
  result=public.social_x_schedule_cancel(p);
  if result->>'state'<>'cancelled'
    or (select status from public.social_posts where id=p)<>'draft'
    or (select state from public.social_x_publication_attempts where post_id=p)<>'rejected'
    then raise exception 'Owner could not cancel the failed partial-checkpoint draft'; end if;
end $$;
reset role;
do $$
begin
  if exists(select 1 from social_private.x_scheduled_publication_payloads
    where post_id='20000000-0000-4000-8000-000000000101')
    then raise exception 'Cancelled partial-checkpoint fixture retained private payload'; end if;
end $$;
select set_config('request.jwt.claim.sub','',false);

-- Both a normal waiting retry and an expired stale claim at the attempt limit
-- must reject the preparing attempt and release every active lease.
update public.social_x_scheduled_publications
  set scheduled_at=now()-interval '1 minute'
  where post_id='20000000-0000-4000-8000-000000000103';
update social_private.x_scheduled_publication_payloads
  set next_check_at=now()-interval '1 minute',claim_count=11
  where post_id='20000000-0000-4000-8000-000000000103';
set role service_role;
do $$
declare
  p uuid='20000000-0000-4000-8000-000000000103';
  file_id uuid='50000000-0000-4000-8000-000000000104';
  owner_id uuid='00000000-0000-4000-8000-000000000002';
  expected jsonb; result jsonb; claim_id uuid; request_id uuid;
  attempt_uuid uuid; publish_lease uuid; snapshot jsonb;
begin
  result=public.social_x_schedule_claim_due();
  if result->>'postId'<>p::text or (result->>'claimCount')::integer<>12
    then raise exception 'Waiting-limit fixture did not reach its twelfth claim'; end if;
  claim_id=(result->>'claimToken')::uuid;
  request_id=(result->>'requestId')::uuid;
  expected=public.test_x_schedule_expected(p,array[file_id],owner_id);
  perform public.social_x_schedule_connection(p,claim_id);
  publish_lease=gen_random_uuid();
  result=public.social_x_publish_prepare(p,owner_id,request_id,array[file_id],publish_lease,expected);
  if result->>'state'<>'preparing' or result->>'claimed'<>'true'
    then raise exception 'Waiting-limit fixture did not create a preparing attempt'; end if;
  attempt_uuid=(result->>'attemptId')::uuid;
  if not public.social_x_schedule_finish(p,claim_id,'waiting',null,now()+interval '5 minutes')
    then raise exception 'Waiting-limit fixture did not finalize'; end if;
  snapshot=public.test_x_schedule_snapshot(p);
  if snapshot->>'state'<>'failed'
    or snapshot->>'errorCode'<>'schedule_attempt_limit'
    or snapshot->>'attemptState'<>'rejected'
    or snapshot->>'attemptError'<>'schedule_attempt_limit'
    or (snapshot->>'hasLease')::boolean
    or snapshot->>'claimToken' is not null
    or snapshot->>'claimExpiresAt' is not null
    or snapshot->>'nextCheckAt' is not null
    then raise exception 'Waiting attempt limit left an active claim or lease'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
set role authenticated;
do $$
declare p uuid='20000000-0000-4000-8000-000000000103'; result jsonb;
begin
  result=public.social_x_schedule_cancel(p);
  if result->>'state'<>'cancelled'
    or (select status from public.social_posts where id=p)<>'draft'
    or (select state from public.social_x_publication_attempts where post_id=p)<>'rejected'
    then raise exception 'Owner could not cancel the waiting-limit draft'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);

update public.social_x_scheduled_publications
  set scheduled_at=now()-interval '1 minute'
  where post_id='20000000-0000-4000-8000-000000000104';
update social_private.x_scheduled_publication_payloads
  set next_check_at=now()-interval '1 minute',claim_count=11
  where post_id='20000000-0000-4000-8000-000000000104';
set role service_role;
do $$
declare
  p uuid='20000000-0000-4000-8000-000000000104';
  owner_id uuid='00000000-0000-4000-8000-000000000002';
  expected jsonb; result jsonb; claim_id uuid; request_id uuid;
  attempt_uuid uuid; publish_lease uuid; snapshot jsonb;
begin
  result=public.social_x_schedule_claim_due();
  if result->>'postId'<>p::text or (result->>'claimCount')::integer<>12
    then raise exception 'Stale-limit fixture did not reach its twelfth claim'; end if;
  claim_id=(result->>'claimToken')::uuid;
  request_id=(result->>'requestId')::uuid;
  expected=public.test_x_schedule_expected(p,'{}',owner_id);
  perform public.social_x_schedule_connection(p,claim_id);
  publish_lease=gen_random_uuid();
  result=public.social_x_publish_prepare(p,owner_id,request_id,'{}',publish_lease,expected);
  if result->>'state'<>'preparing' or result->>'claimed'<>'true'
    then raise exception 'Stale-limit fixture did not create a preparing attempt'; end if;
  attempt_uuid=(result->>'attemptId')::uuid;
  perform public.test_x_schedule_expire_claim(p);
  result=public.social_x_schedule_claim_due();
  snapshot=public.test_x_schedule_snapshot(p);
  if result is not null
    or snapshot->>'state'<>'failed'
    or snapshot->>'errorCode'<>'schedule_attempt_limit'
    or snapshot->>'attemptState'<>'rejected'
    or snapshot->>'attemptError'<>'schedule_attempt_limit'
    or (snapshot->>'hasLease')::boolean
    or snapshot->>'claimToken' is not null
    or snapshot->>'claimExpiresAt' is not null
    or snapshot->>'nextCheckAt' is not null
    then raise exception 'Stale claim attempt limit left an active claim or lease'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
set role authenticated;
do $$
declare p uuid='20000000-0000-4000-8000-000000000104'; result jsonb;
begin
  result=public.social_x_schedule_cancel(p);
  if result->>'state'<>'cancelled'
    or (select status from public.social_posts where id=p)<>'draft'
    or (select state from public.social_x_publication_attempts where post_id=p)<>'rejected'
    then raise exception 'Owner could not cancel the stale-limit draft'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);

do $$
declare
  p uuid='20000000-0000-4000-8000-000000000095';
  p_cancel uuid='20000000-0000-4000-8000-000000000097';
  p_claim_race uuid='20000000-0000-4000-8000-000000000098';
  p_cancel_race uuid='20000000-0000-4000-8000-000000000099';
  owner_id uuid='00000000-0000-4000-8000-000000000002';
  viewer_id uuid='00000000-0000-4000-8000-000000000004';
  global_admin uuid='00000000-0000-4000-8000-000000000005';
  req uuid; s public.social_x_scheduled_publications;
begin
  select request_id into req from social_private.x_scheduled_publication_payloads where post_id=p;
  if req is null or not exists(select 1 from social_private.x_scheduled_publication_payloads payload
      where payload.post_id=p and payload.request_id=req and payload.user_id=owner_id
        and payload.integration_id=(select id from public.social_integrations
          where workspace_id='10000000-0000-4000-8000-000000000089' and channel='x')
        and payload.connection_revision is not null
        and payload.connection_fingerprint=social_private.x_schedule_connection_binding(
          (select workspace_id from public.social_integrations where id=payload.integration_id),
          payload.user_id,payload.integration_id,payload.account_id)
        and payload.account_id='888'
        and payload.scopes='tweet.read tweet.write users.read offline.access media.write'
        and payload.expected->>'body'='Synthetic body'
        and payload.expected->'files'->0->>'sha256'=repeat('a',64))
    then raise exception 'Queue did not freeze the exact user, stable connection binding, account, and file snapshot'; end if;
  if (select count(*) from public.social_x_scheduled_publications where post_id=p)<>1
    or exists(select 1 from public.social_x_scheduled_publications where post_id in (
    '20000000-0000-4000-8000-000000000096'))
    then raise exception 'X queue contains duplicate or non-opt-in reservation'; end if;

  select * into s from public.social_x_scheduled_publications where post_id=p_cancel;
  if s.state<>'cancelled'
    or (select status from public.social_posts where id=p_cancel)<>'draft'
    or (select scheduled_at from public.social_posts where id=p_cancel) is not null
    or exists(select 1 from social_private.x_scheduled_publication_payloads where post_id=p_cancel)
    then raise exception 'Cancellation did not atomically unlock the saved draft'; end if;

  select * into s from public.social_x_scheduled_publications
    where post_id='20000000-0000-4000-8000-000000000099';
  if s.state<>'queued'
    or (select state from public.social_x_publication_attempts
      where post_id='20000000-0000-4000-8000-000000000099')<>'preparing'
    then raise exception 'Video wait fixture was not queued with a preparing attempt'; end if;

  perform set_config('request.jwt.claim.sub',viewer_id::text,false);
end $$;
set role authenticated;
do $$
declare
  p uuid='20000000-0000-4000-8000-000000000095';
begin
  if (select count(*) from public.social_x_scheduled_publications where post_id=p)<>1
    then raise exception 'Workspace reader cannot see safe schedule state'; end if;
  if has_table_privilege(current_user,'social_private.x_scheduled_publication_payloads','SELECT')
    then raise exception 'Workspace reader can read private schedule payload'; end if;
  perform pg_temp.expect_failure(format(
    'select public.social_x_schedule_cancel(%L)','20000000-0000-4000-8000-000000000095'
  ),'forbidden');
  perform pg_temp.expect_failure(format(
    'select public.social_x_schedule_enqueue(%L,%L,%L)',
    '20000000-0000-4000-8000-000000000095',gen_random_uuid(),
    jsonb_build_object('body','Synthetic body','files','[]'::jsonb,
      'connectionFingerprint',repeat('0',64))::text
  ),'forbidden');
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
set role authenticated;
do $$begin
  perform pg_temp.expect_failure(format(
    'select public.social_x_schedule_cancel(%L)','20000000-0000-4000-8000-000000000095'
  ),'forbidden');
end $$;
reset role;
set role anon;
do $$begin
  if has_table_privilege('anon','public.social_x_scheduled_publications','SELECT')
    then raise exception 'Anonymous schedule table access was granted'; end if;
  perform pg_temp.expect_failure(
    'select count(*) from public.social_x_scheduled_publications','permission'
  );
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);

-- Make the two isolated race fixtures due for the independent-connection test.
update public.social_x_scheduled_publications
  set scheduled_at=now()-interval '1 minute'
  where post_id in ('20000000-0000-4000-8000-000000000098','20000000-0000-4000-8000-000000000099');
update social_private.x_scheduled_publication_payloads
  set next_check_at=now()-interval '1 minute'
  where post_id in ('20000000-0000-4000-8000-000000000098','20000000-0000-4000-8000-000000000099');
