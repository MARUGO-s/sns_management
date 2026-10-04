-- Synthetic isolated PostgreSQL assertions only, never run against production.
create function pg_temp.expect_failure(statement text,expected text) returns void language plpgsql as $$
declare rejected boolean=false;
begin
  begin execute statement; exception when others then
    rejected=(sqlerrm=expected or (expected='permission' and sqlstate='42501')
      or (expected='foreign_key' and sqlstate='23503'));
    if not rejected then raise exception 'Unexpected failure %, expected %',sqlerrm,expected; end if;
  end;
  if not rejected then raise exception 'Expected failure % did not occur',expected; end if;
end;
$$;
-- Fixture convenience: emulate a confirmation preview using only synthetic file hashes.
-- Kept in the disposable database so independent test connections can use the same helper.
create function public.test_x_publish_expected(p_post uuid,p_files uuid[],p_user uuid default null) returns jsonb
language plpgsql as $$
declare post public.social_posts; files jsonb; connection jsonb;
begin
  select * into post from public.social_posts where id=p_post;
  files=social_private.x_publish_snapshot(post.id,post.workspace_id,p_files);
  select coalesce(jsonb_agg(value||jsonb_build_object('sha256',repeat('a',64)) order by ordinality),'[]'::jsonb)
    into files from jsonb_array_elements(files) with ordinality;
  connection=public.social_x_publish_connection(post.workspace_id,coalesce(p_user,post.created_by));
  return jsonb_build_object('body',post.body,'files',files,'connectionFingerprint',connection->>'fingerprint');
end $$;
create function public.test_x_publish_prepare(p_post uuid,p_user uuid,p_request uuid,p_files uuid[],p_lease uuid)
returns jsonb language plpgsql as $$
begin
  return public.social_x_publish_prepare(p_post,p_user,p_request,p_files,p_lease,
    public.test_x_publish_expected(p_post,p_files,p_user));
end $$;
do $$
declare f record;
begin
  for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'social_x_publish_%' loop
    if has_function_privilege('authenticated',f.oid,'EXECUTE') or has_function_privilege('anon',f.oid,'EXECUTE')
      or not has_function_privilege('service_role',f.oid,'EXECUTE') then raise exception 'Publication RPC privilege leak'; end if;
  end loop;
  if has_table_privilege('authenticated','social_private.x_publication_payloads','SELECT')
    or has_table_privilege('anon','public.social_x_publication_attempts','SELECT')
    or has_table_privilege('authenticated','public.social_x_publication_attempts','UPDATE')
    or has_table_privilege('authenticated','public.social_x_publication_attempts','INSERT')
    or has_table_privilege('authenticated','public.social_x_publication_attempts','DELETE')
    then raise exception 'Publication table privilege leak'; end if;
end $$;

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000004','synthetic-viewer@example.invalid'),
  ('00000000-0000-4000-8000-000000000005','synthetic-global-admin@example.invalid');
insert into public.social_admin_users(user_id) values ('00000000-0000-4000-8000-000000000005');
insert into public.social_workspaces(id,name,created_by) values
  ('10000000-0000-4000-8000-000000000080','Synthetic publishing workspace','00000000-0000-4000-8000-000000000002');
insert into public.social_workspace_members(workspace_id,user_id,role) values
  ('10000000-0000-4000-8000-000000000080','00000000-0000-4000-8000-000000000003','member'),
  ('10000000-0000-4000-8000-000000000080','00000000-0000-4000-8000-000000000004','viewer');
insert into public.social_posts(id,workspace_id,title,body,created_by)
  select ('20000000-0000-4000-8000-0000000000'||n)::uuid,
    '10000000-0000-4000-8000-000000000080','Synthetic title','Synthetic body',
    '00000000-0000-4000-8000-000000000002' from generate_series(80,87) n;
insert into public.social_post_channels(post_id,channel)
  select ('20000000-0000-4000-8000-0000000000'||n)::uuid,'x' from generate_series(80,87) n;
insert into public.social_post_channels(post_id,channel) values
  ('20000000-0000-4000-8000-000000000081','instagram');
insert into public.social_post_files(id,workspace_id,post_id,storage_path,file_name,content_type,file_size,created_by) values
  ('50000000-0000-4000-8000-000000000080','10000000-0000-4000-8000-000000000080',
   '20000000-0000-4000-8000-000000000080',
   '10000000-0000-4000-8000-000000000080/20000000-0000-4000-8000-000000000080/synthetic.png',
   'synthetic.png','image/png',80,'00000000-0000-4000-8000-000000000002'),
  ('50000000-0000-4000-8000-000000000082','10000000-0000-4000-8000-000000000080',
   '20000000-0000-4000-8000-000000000082','different/prefix/synthetic.png',
   'synthetic.png','image/png',80,'00000000-0000-4000-8000-000000000002');
insert into storage.objects(bucket_id,name) values ('social-post-files',
  '10000000-0000-4000-8000-000000000080/20000000-0000-4000-8000-000000000080/synthetic.png');
do $$declare w uuid='10000000-0000-4000-8000-000000000080';
  owner_id uuid='00000000-0000-4000-8000-000000000002';
begin
  perform public.social_x_oauth_configure(w,owner_id,'synthetic-client','synthetic-secret',
    'tweet.read tweet.write users.read offline.access media.write','https://fixture.invalid/cb');
  perform public.social_x_oauth_begin(w,owner_id,repeat('7',64),'synthetic-verifier');
  perform public.social_x_oauth_claim(repeat('7',64));
  perform public.social_x_oauth_finish(repeat('7',64),'synthetic-access','synthetic-refresh',now()+interval '2 hours','777','synthetic');
end $$;
do $$
declare p uuid='20000000-0000-4000-8000-000000000080';
  owner_id uuid='00000000-0000-4000-8000-000000000002';
  viewer uuid='00000000-0000-4000-8000-000000000004';
  global_admin uuid='00000000-0000-4000-8000-000000000005';
  req uuid=gen_random_uuid();lease uuid=gen_random_uuid();next_lease uuid=gen_random_uuid();a jsonb;id uuid;token jsonb;
  file_ids uuid[]=array['50000000-0000-4000-8000-000000000080'::uuid];media jsonb;
begin
  perform pg_temp.expect_failure(format('select public.test_x_publish_prepare(%L,%L,%L,%L,%L)',p,viewer,req,'{}',lease),'forbidden');
  perform pg_temp.expect_failure(format('select public.test_x_publish_prepare(%L,%L,%L,%L,%L)',p,global_admin,req,'{}',lease),'forbidden');
  perform pg_temp.expect_failure(format('select public.social_x_publish_connection(%L,%L)',
    '10000000-0000-4000-8000-000000000080',viewer),'forbidden');
  perform pg_temp.expect_failure(format('select public.social_x_publish_connection(%L,%L)',
    '10000000-0000-4000-8000-000000000080',global_admin),'forbidden');
  perform pg_temp.expect_failure(format('select public.test_x_publish_prepare(%L,%L,%L,%L,%L)',p,owner_id,req,null,lease),'invalid_request');
  perform pg_temp.expect_failure(format('select public.test_x_publish_prepare(%L,%L,%L,%L,%L)',p,owner_id,req,
    array['50000000-0000-4000-8000-000000000082'::uuid]::text,lease),'invalid_request');
  perform pg_temp.expect_failure(format('select public.test_x_publish_prepare(%L,%L,%L,%L,%L)',
    '20000000-0000-4000-8000-000000000082',owner_id,req,array['50000000-0000-4000-8000-000000000082'::uuid]::text,lease),'invalid_request');
  a=public.test_x_publish_prepare(p,owner_id,req,file_ids,lease);id=(a->>'attemptId')::uuid;
  if not (a->>'claimed')::boolean or a->>'body'<>'Synthetic body' or jsonb_array_length(a->'files')<>1
    or a->'files'->0->>'storagePath' not like '%/synthetic.png' or a->'files'->0->>'sha256'<>repeat('a',64)
    then raise exception 'Immutable snapshot mismatch'; end if;
  if not exists(select 1 from social_private.x_publication_payloads snapshot
    join public.social_x_oauth_configs config on config.integration_id=snapshot.integration_id
    where snapshot.attempt_id=id and snapshot.token_revision=config.revision
      and snapshot.token_version=config.token_version and snapshot.account_id=config.account_id)
    then raise exception 'Connection was not bound at prepare';end if;
  a=public.test_x_publish_prepare(p,owner_id,req,file_ids,next_lease);
  if (a->>'claimed')::boolean or a ? 'body' or a ? 'files' then raise exception 'Concurrent claim exposes private snapshot'; end if;
  perform pg_temp.expect_failure(format('select public.test_x_publish_prepare(%L,%L,%L,%L,%L)',p,owner_id,req,'{}',lease),'stale_snapshot');
  a=public.test_x_publish_prepare(p,owner_id,gen_random_uuid(),file_ids,next_lease);
  if (a->>'claimed')::boolean or (a->>'attemptId')::uuid<>id then raise exception 'Fresh key bypassed active attempt'; end if;
  perform pg_temp.expect_failure(format('update public.social_posts set body=%L where id=%L','Changed',p),'publication_locked');
  perform pg_temp.expect_failure(format('delete from public.social_posts where id=%L',p),'publication_locked');
  perform pg_temp.expect_failure(format('delete from public.social_post_files where post_id=%L',p),'publication_locked');
  perform pg_temp.expect_failure(format('update public.social_post_files set file_size=90 where post_id=%L',p),'publication_locked');
  perform pg_temp.expect_failure(format('delete from public.social_post_channels where post_id=%L',p),'publication_locked');
  perform pg_temp.expect_failure(format('insert into public.social_post_channels(post_id,channel) values(%L,%L)',p,'threads'),'publication_locked');
  perform pg_temp.expect_failure(format('delete from storage.objects where name like %L','%/'||p||'/%'),'publication_locked');
  perform pg_temp.expect_failure(format('update storage.objects set name=%L where name like %L','moved/file','%/'||p||'/%'),'publication_locked');
  perform pg_temp.expect_failure(format('insert into storage.objects(bucket_id,name) values(%L,%L)','social-post-files',
    '10000000-0000-4000-8000-000000000080/'||p||'/new.png'),'publication_locked');
  -- An unrelated bucket is unaffected even if its name coincides with a frozen SNS path.
  insert into storage.objects(bucket_id,name) values('gourmet-files','10000000-0000-4000-8000-000000000080/'||p||'/synthetic.png');
  delete from storage.objects where bucket_id='gourmet-files';
  token=public.social_x_publish_token(id,owner_id,lease);
  if token->>'accessToken'<>'synthetic-access' or (token->>'needsRefresh')::boolean then raise exception 'Verified token mismatch'; end if;
  perform pg_temp.expect_failure(format('select public.social_x_publish_dispatch(%L,%L,%L)',id,owner_id,lease),'media_expired');
  media=jsonb_build_array(jsonb_build_object('id','700','state','pending','expiresAt',now()+interval '1 hour','nextCheckAt',now()+interval '5 seconds'));
  perform public.social_x_publish_media(id,owner_id,lease,media,true);
  perform pg_temp.expect_failure(format('select public.social_x_publish_token(%L,%L,%L)',id,owner_id,lease),'busy');
  a=public.test_x_publish_prepare(p,owner_id,req,file_ids,next_lease);
  if not (a->>'claimed')::boolean or a->'media'<>media then raise exception 'Released media attempt did not resume'; end if;
  perform pg_temp.expect_failure(format('select public.social_x_publish_media(%L,%L,%L,%L,false)',id,owner_id,next_lease,
    '[{"id":"701","state":"ready","expiresAt":"2099-01-01T00:00:00Z"}]'),'unsupported_media');
  media=jsonb_set(jsonb_set(media,'{0,state}','"ready"'),'{0,expiresAt}',to_jsonb(now()+interval '45 minutes'))-'nextCheckAt';
  perform public.social_x_publish_media(id,owner_id,next_lease,media,false);
  perform pg_temp.expect_failure(format('select public.social_x_publish_media(%L,%L,%L,%L,false)',id,owner_id,next_lease,
    jsonb_set(media,'{0,expiresAt}',to_jsonb(now()+interval '50 minutes'))::text),'stale_snapshot');
  perform public.social_x_publish_token(id,owner_id,next_lease);
  a=public.social_x_publish_dispatch(id,owner_id,next_lease);
  if a->'mediaIds'<>jsonb_build_array('700') then raise exception 'Media IDs mismatch'; end if;
  perform pg_temp.expect_failure(format('select public.social_x_publish_dispatch(%L,%L,%L)',id,owner_id,next_lease),'busy');
  update social_private.x_publication_payloads set lease_expires_at=now()-interval '1 second' where attempt_id=id;
  a=public.test_x_publish_prepare(p,owner_id,gen_random_uuid(),file_ids,gen_random_uuid());
  if a->>'state'<>'unknown' or (a->>'claimed')::boolean then raise exception 'Orphaned sending was reclaimed'; end if;
  perform pg_temp.expect_failure(format('delete from public.social_posts where id=%L',p),'publication_locked');
  -- Late known-success evidence settles unknown, and may be repeated idempotently.
  perform public.social_x_publish_finish(id,next_lease,'published','70000',null);
  perform public.social_x_publish_finish(id,next_lease,'published','70000',null);
  if (select status from public.social_posts post_row where post_row.id=p)<>'published' then raise exception 'Sole X post status not published'; end if;
  perform pg_temp.expect_failure(format('delete from public.social_posts where id=%L',p),'publication_locked');
  perform pg_temp.expect_failure(format('select public.social_x_publish_finish(%L,%L,%L,%L,null)',id,next_lease,'published','70001'),'invalid_request');
end $$;

-- Authenticated reads expose ONLY safe receipts and actual workspace membership.
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000004';
do $$begin
  if (select count(*) from public.social_x_publication_attempts)<>1 then raise exception 'Viewer safe receipt not visible'; end if;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000005';
do $$begin
  if (select count(*) from public.social_x_publication_attempts)<>0 then raise exception 'Unrelated global admin read receipt'; end if;
end $$;
reset role;
set request.jwt.claim.sub='';

do $$
declare w uuid='10000000-0000-4000-8000-000000000080';owner_id uuid='00000000-0000-4000-8000-000000000002';
  p uuid='20000000-0000-4000-8000-000000000081';id uuid;a jsonb;l uuid=gen_random_uuid();r uuid=gen_random_uuid();
  i uuid;token jsonb;refresh jsonb;refresh_lease uuid=gen_random_uuid();
begin
  a=public.test_x_publish_prepare(p,owner_id,r,'{}',l);id=(a->>'attemptId')::uuid;
  perform public.social_x_publish_token(id,owner_id,l);
  perform public.social_x_publish_dispatch(id,owner_id,l);
  perform public.social_x_publish_finish(id,l,'published','81000',null);
  if (select status from public.social_posts post_row where post_row.id=p)='published' then raise exception 'X marked other SNS as published'; end if;
  -- Client/global status does not create a valid X receipt.
  update public.social_posts post_row set status='published' where post_row.id='20000000-0000-4000-8000-000000000082';
  perform pg_temp.expect_failure(format('select public.test_x_publish_prepare(%L,%L,%L,%L,%L)',
    '20000000-0000-4000-8000-000000000082',owner_id,gen_random_uuid(),'{}',gen_random_uuid()),'already_published');
  -- Pre-dispatch validation rejection allows a fresh explicit request, never the same key.
  p='20000000-0000-4000-8000-000000000083';l=gen_random_uuid();r=gen_random_uuid();
  a=public.test_x_publish_prepare(p,owner_id,r,'{}',l);id=(a->>'attemptId')::uuid;
  perform public.social_x_publish_finish(id,l,'rejected',null,'invalid_request');
  perform public.social_x_publish_finish(id,l,'rejected',null,'invalid_request');
  a=public.test_x_publish_prepare(p,owner_id,r,'{}',gen_random_uuid());
  if a->>'state'<>'rejected' or (a->>'claimed')::boolean then raise exception 'Rejected same request was retried'; end if;
  update public.social_posts post_row set body='Changed after rejected attempt' where post_row.id=p;
  perform pg_temp.expect_failure(format('select public.test_x_publish_prepare(%L,%L,%L,%L,%L)',
    p,owner_id,r,'{}',gen_random_uuid()),'stale_snapshot');
  a=public.test_x_publish_prepare(p,owner_id,gen_random_uuid(),'{}',gen_random_uuid());
  if not (a->>'claimed')::boolean or (a->>'attemptId')::uuid=id then raise exception 'Explicit fresh request prevented'; end if;
  -- Expired preparing leases may be reclaimed; a stale worker can no longer dispatch/finish.
  p='20000000-0000-4000-8000-000000000084';l=gen_random_uuid();r=gen_random_uuid();
  a=public.test_x_publish_prepare(p,owner_id,r,'{}',l);id=(a->>'attemptId')::uuid;
  update social_private.x_publication_payloads set lease_expires_at=now()-interval '1 second' where attempt_id=id;
  a=public.test_x_publish_prepare(p,owner_id,r,'{}',gen_random_uuid());
  if not (a->>'claimed')::boolean then raise exception 'Expired preparing claim not recovered'; end if;
  perform pg_temp.expect_failure(format('select public.social_x_publish_dispatch(%L,%L,%L)',id,owner_id,l),'busy');
  perform pg_temp.expect_failure(format('select public.social_x_publish_finish(%L,%L,%L,null,%L)',id,l,'rejected','invalid_request'),'busy');
  -- Exactly one same-user verified refresh may rebind a preparation to the rotated generation.
  p='20000000-0000-4000-8000-000000000085';l=gen_random_uuid();r=gen_random_uuid();
  a=public.test_x_publish_prepare(p,owner_id,r,'{}',l);id=(a->>'attemptId')::uuid;
  token=public.social_x_publish_token(id,owner_id,l);i=(token->>'integrationId')::uuid;
  update public.social_x_oauth_configs set expires_at=now()-interval '1 second' where integration_id=i;
  token=public.social_x_publish_token(id,owner_id,l);
  if not (token->>'needsRefresh')::boolean then raise exception 'Expired token refresh signal missing'; end if;
  refresh=public.social_x_oauth_refresh_claim(w,owner_id,refresh_lease);
  perform public.social_x_oauth_refresh_finish(i,owner_id,refresh_lease,(refresh->>'revision')::uuid,(refresh->>'version')::bigint,
    'synthetic-rotated-access','synthetic-rotated-refresh',now()+interval '2 hours','777','synthetic');
  -- Same-key resume may supply the fresh preview fingerprint after OUR refresh, but
  -- must not replace the original token binding. Only the token RPC's verified CAS may.
  update social_private.x_publication_payloads set lease_expires_at=now()-interval '1 second' where attempt_id=id;
  l=gen_random_uuid();
  a=public.test_x_publish_prepare(p,owner_id,r,'{}',l);
  if not (a->>'claimed')::boolean or not exists(select 1 from social_private.x_publication_payloads snapshot
    where snapshot.attempt_id=id and snapshot.token_revision=(refresh->>'revision')::uuid)
    then raise exception 'Same-key resume overwrote original connection binding';end if;
  token=public.social_x_publish_token(id,owner_id,l);
  if token->>'accessToken'<>'synthetic-rotated-access' then raise exception 'Rotated generation not rebound'; end if;
  -- Token config mutations invalidate the bind and prevent dispatch.
  update public.social_integrations integ set app_id='changed-synthetic-client' where integ.id=i;
  perform pg_temp.expect_failure(format('select public.social_x_publish_dispatch(%L,%L,%L)',id,owner_id,l),'not_connected');
  perform pg_temp.expect_failure(format('select public.social_x_publish_token(%L,%L,%L)',id,owner_id,l),'not_connected');
  -- Receipts remain retained on attempted workspace/user/post cascading deletion.
  perform pg_temp.expect_failure(format('delete from public.social_workspaces where id=%L',w),'publication_locked');
  perform pg_temp.expect_failure(format('delete from auth.users where id=%L',owner_id),'foreign_key');
  if (select marker from public.gourmet_fixture fixture where fixture.id=1)<>'preserve-gourmet' then raise exception 'Unrelated data changed'; end if;
end $$;
do $$
declare w uuid='10000000-0000-4000-8000-000000000080';owner_id uuid='00000000-0000-4000-8000-000000000002';
  p uuid='20000000-0000-4000-8000-000000000086';a jsonb;l uuid=gen_random_uuid();r uuid=gen_random_uuid();id uuid;i uuid;
begin
  i=public.social_x_oauth_configure(w,owner_id,'legacy-four-scope-client','',
    'tweet.read tweet.write users.read offline.access','https://fixture.invalid/cb');
  perform public.social_x_oauth_begin(w,owner_id,repeat('6',64),'synthetic-verifier');
  perform public.social_x_oauth_claim(repeat('6',64));
  perform public.social_x_oauth_finish(repeat('6',64),'synthetic-base-access','synthetic-base-refresh',now()+interval '2 hours','777','synthetic');
  insert into public.social_post_files(id,workspace_id,post_id,storage_path,file_name,content_type,file_size,created_by)
    values('50000000-0000-4000-8000-000000000086',w,p,w||'/'||p||'/synthetic.png','synthetic.png','image/png',80,owner_id);
  a=public.test_x_publish_prepare(p,owner_id,r,array['50000000-0000-4000-8000-000000000086'::uuid],l);
  id=(a->>'attemptId')::uuid;
  perform pg_temp.expect_failure(format('select public.social_x_publish_token(%L,%L,%L)',id,owner_id,l),'media_permission_required');
  if (select scopes from public.social_integrations integ where integ.id=i)<>'tweet.read tweet.write users.read offline.access'
    or (select access_token from public.social_integration_secrets where integration_id=i)<>'synthetic-base-access'
    then raise exception 'Media permission guard altered existing text connection';end if;
end $$;
do $$
declare w uuid='10000000-0000-4000-8000-000000000080';owner_id uuid='00000000-0000-4000-8000-000000000002';
  p uuid='20000000-0000-4000-8000-000000000087';a jsonb;l uuid=gen_random_uuid();r uuid=gen_random_uuid();receipt_id uuid;
begin
  insert into public.social_post_files(id,workspace_id,post_id,storage_path,file_name,content_type,file_size,created_by,media_variant)
    values('50000000-0000-4000-8000-000000000087',w,p,w||'/'||p||'/processed.png',
      'processed.png','image/png',80,owner_id,'processed');
  perform pg_temp.expect_failure(format('select public.test_x_publish_prepare(%L,%L,%L,%L,%L)',
    p,owner_id,r,array['50000000-0000-4000-8000-000000000087'::uuid]::text,l),'invalid_request');
  if exists(select 1 from public.social_x_publication_attempts where post_id=p)
    then raise exception 'Processed media created an attempt';end if;
  a=public.test_x_publish_prepare(p,owner_id,r,'{}',l);receipt_id=(a->>'attemptId')::uuid;
  perform public.social_x_publish_finish(receipt_id,l,'rejected',null,'invalid_request');
  delete from public.social_posts post_row where post_row.id=p;
  if exists(select 1 from public.social_posts post_row where post_row.id=p)
    or exists(select 1 from public.social_x_publication_attempts where post_id=p)
    or exists(select 1 from social_private.x_publication_payloads where attempt_id=receipt_id)
    or exists(select 1 from public.social_post_files where post_id=p)
    then raise exception 'Rejected-only draft cleanup retained children';end if;
end $$;
do $$
declare w uuid='10000000-0000-4000-8000-000000000080';owner_id uuid='00000000-0000-4000-8000-000000000002';
  p uuid;expected jsonb;changed jsonb;preview jsonb;a jsonb;receipt_id uuid;l uuid=gen_random_uuid();r uuid=gen_random_uuid();
begin
  insert into public.social_posts(id,workspace_id,title,body,created_by)
    select ('20000000-0000-4000-8000-0000000000'||n)::uuid,w,'Synthetic preview','Synthetic preview body',owner_id
      from generate_series(89,91) n;
  insert into public.social_post_channels(post_id,channel)
    select ('20000000-0000-4000-8000-0000000000'||n)::uuid,'x' from generate_series(89,91) n;
  preview=public.social_x_publish_connection(w,owner_id);
  if preview->>'fingerprint' !~ '^[a-f0-9]{64}$' or preview->>'username'<>'synthetic'
    or exists(select 1 from jsonb_object_keys(preview) key where key not in ('fingerprint','username'))
    then raise exception 'Connection preview leaked private binding';end if;
  p='20000000-0000-4000-8000-000000000089';
  expected=public.test_x_publish_expected(p,'{}',owner_id);
  update public.social_posts post_row set body='Changed after preview' where post_row.id=p;
  perform pg_temp.expect_failure(format('select public.social_x_publish_prepare(%L,%L,%L,%L,%L,%L)',
    p,owner_id,r,'{}',l,expected::text),'stale_snapshot');
  if exists(select 1 from public.social_x_publication_attempts where post_id=p)
    then raise exception 'Stale body preview created receipt';end if;
  expected=public.test_x_publish_expected(p,'{}',owner_id);
  changed=expected||jsonb_build_object('unexpected','must reject');
  perform pg_temp.expect_failure(format('select public.social_x_publish_prepare(%L,%L,%L,%L,%L,%L)',
    p,owner_id,r,'{}',l,changed::text),'invalid_request');
  changed=jsonb_set(expected,'{connectionFingerprint}','"not-a-fingerprint"');
  perform pg_temp.expect_failure(format('select public.social_x_publish_prepare(%L,%L,%L,%L,%L,%L)',
    p,owner_id,r,'{}',l,changed::text),'invalid_request');
  p='20000000-0000-4000-8000-000000000090';
  insert into public.social_post_files(id,workspace_id,post_id,storage_path,file_name,content_type,file_size,created_by)
    values('50000000-0000-4000-8000-000000000090',w,p,w||'/'||p||'/synthetic.png','synthetic.png','image/png',80,owner_id);
  expected=public.test_x_publish_expected(p,array['50000000-0000-4000-8000-000000000090'::uuid],owner_id);
  update public.social_post_files set file_size=81 where post_id=p;
  perform pg_temp.expect_failure(format('select public.social_x_publish_prepare(%L,%L,%L,%L,%L,%L)',
    p,owner_id,r,array['50000000-0000-4000-8000-000000000090'::uuid]::text,l,expected::text),'stale_snapshot');
  if exists(select 1 from public.social_x_publication_attempts where post_id=p)
    then raise exception 'Stale file metadata preview created receipt';end if;
  update public.social_post_files set file_size=80 where post_id=p;
  changed=jsonb_set(expected,'{files,0,sha256}','"not-a-file-hash"');
  perform pg_temp.expect_failure(format('select public.social_x_publish_prepare(%L,%L,%L,%L,%L,%L)',
    p,owner_id,r,array['50000000-0000-4000-8000-000000000090'::uuid]::text,l,changed::text),'invalid_request');
  a=public.social_x_publish_prepare(p,owner_id,r,array['50000000-0000-4000-8000-000000000090'::uuid],l,expected);
  receipt_id=(a->>'attemptId')::uuid;
  changed=jsonb_set(expected,'{files,0,sha256}',to_jsonb(repeat('b',64)));
  perform pg_temp.expect_failure(format('select public.social_x_publish_prepare(%L,%L,%L,%L,%L,%L)',
    p,owner_id,r,array['50000000-0000-4000-8000-000000000090'::uuid]::text,l,changed::text),'stale_snapshot');
  perform public.social_x_publish_finish(receipt_id,l,'rejected',null,'invalid_request');
  p='20000000-0000-4000-8000-000000000091';
  expected=public.test_x_publish_expected(p,'{}',owner_id);
  perform public.social_x_oauth_configure(w,owner_id,'changed-after-preview-client','',
    'tweet.read tweet.write users.read offline.access','https://fixture.invalid/cb');
  perform public.social_x_oauth_begin(w,owner_id,repeat('9',64),'synthetic-verifier');
  perform public.social_x_oauth_claim(repeat('9',64));
  perform public.social_x_oauth_finish(repeat('9',64),'synthetic-changed-access','synthetic-changed-refresh',
    now()+interval '2 hours','778','synthetic_new');
  perform pg_temp.expect_failure(format('select public.social_x_publish_prepare(%L,%L,%L,%L,%L,%L)',
    p,owner_id,r,'{}',l,expected::text),'stale_snapshot');
  if exists(select 1 from public.social_x_publication_attempts where post_id=p)
    then raise exception 'Stale connection preview created receipt';end if;
  preview=public.social_x_publish_connection(w,owner_id);
  if preview->>'fingerprint'=expected->>'connectionFingerprint' or preview->>'username'<>'synthetic_new'
    then raise exception 'Connection change not reflected in preview';end if;
end $$;
select 'X publication permissions, receipt, media, mutation and generation assertions passed' as result;
