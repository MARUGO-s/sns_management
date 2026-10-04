-- Run after fixture + bootstrap + additive migration in isolated postgres, never production.
-- Each block rolls failures back locally, proving preservation of prior working credentials.
DO $$
declare f record;
begin
  for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'social_x_oauth_%' loop
    if has_function_privilege('authenticated',f.oid,'EXECUTE') or has_function_privilege('anon',f.oid,'EXECUTE')
      or not has_function_privilege('service_role',f.oid,'EXECUTE') then raise exception 'OAuth RPC privilege leak'; end if;
  end loop;
  if has_table_privilege('authenticated','public.social_x_oauth_states','SELECT')
    or has_table_privilege('anon','public.social_x_oauth_configs','SELECT') then raise exception 'OAuth state/config leak'; end if;
  if has_function_privilege('authenticated','public.social_integration_secrets_mutate(uuid,uuid,text,text,text,text,text,text)','EXECUTE')
    or has_function_privilege('anon','public.social_integration_secrets_mutate(uuid,uuid,text,text,text,text,text,text)','EXECUTE')
    or not has_function_privilege('service_role','public.social_integration_secrets_mutate(uuid,uuid,text,text,text,text,text,text)','EXECUTE')
    then raise exception 'Legacy mutation RPC privilege leak'; end if;
end $$;
DO $$
declare
 w uuid='10000000-0000-4000-8000-000000000099';
 owner_id uuid='00000000-0000-4000-8000-000000000002';
 outsider uuid='00000000-0000-4000-8000-000000000003';
 i uuid; saved_revision uuid; config jsonb; failed boolean; lease uuid=gen_random_uuid(); newer_lease uuid=gen_random_uuid();
 h text=repeat('a',64); h2 text=repeat('b',64); h3 text=repeat('c',64);
begin
 insert into public.social_workspaces(id,name,created_by) values(w,'OAuth isolated fixture',owner_id);
 i=public.social_x_oauth_configure(w,owner_id,'fixture-client','fixture-secret','tweet.read tweet.write users.read offline.access','https://fixture.invalid/cb');
 failed=false;
 begin perform public.social_x_oauth_configure(w,outsider,'bad','','tweet.read tweet.write users.read offline.access','https://fixture.invalid/cb');
 exception when others then failed=sqlerrm='forbidden'; end;
 if not failed then raise exception 'Nonmember configure allowed'; end if;
 failed=false;
 begin perform public.social_x_oauth_begin(w,outsider,h,'verifier'); exception when others then failed=sqlerrm='forbidden'; end;
 if not failed then raise exception 'Nonmember start allowed'; end if;
 perform public.social_x_oauth_begin(w,owner_id,h,'verifier');
 config=public.social_x_oauth_claim(h);
 if config->>'clientSecret'<>'fixture-secret' then raise exception 'Client snapshot mismatch'; end if;
 failed=false;
 begin perform public.social_x_oauth_claim(h); exception when others then failed=sqlerrm='invalid_state'; end;
 if not failed then raise exception 'State replay allowed'; end if;
 perform public.social_x_oauth_finish(h,'fixture-access','fixture-refresh',now()+interval '2 hours','1234','fixture_user');
 -- Re-saving exactly the same config/blank preserved secret does not disconnect valid tokens.
 select c.revision into saved_revision from public.social_x_oauth_configs c where integration_id=i;
 perform public.social_x_oauth_configure(w,owner_id,'fixture-client','','tweet.read tweet.write users.read offline.access','https://fixture.invalid/cb');
 if not exists(select 1 from public.social_x_oauth_configs c join public.social_integrations integ on integ.id=c.integration_id
   where c.integration_id=i and c.revision=saved_revision and c.token_revision=c.revision and c.account_id='1234'
     and c.expires_at>now() and integ.status='configured') then raise exception 'Unchanged config disconnected token'; end if;
 -- Expiry changes connected status, but a verified same-client refresh remains available.
 update public.social_x_oauth_configs set expires_at=now()-interval '1 second' where integration_id=i;
 if exists(select 1 from public.social_x_oauth_configs c join public.social_integrations integ on integ.id=c.integration_id
   where c.integration_id=i and c.token_revision=c.revision and integ.status='configured' and c.expires_at>now()) then raise exception 'Expired token marked connected'; end if;
 config=public.social_x_oauth_refresh_claim(w,owner_id,lease);
 perform public.social_x_oauth_refresh_release(i,lease);
 update public.social_x_oauth_configs set expires_at=now()+interval '2 hours' where integration_id=i;
 failed=false;
 begin perform public.social_x_oauth_finish(h,'replay','replay',now()+interval '2 hours','1234','fixture_user'); exception when others then failed=sqlerrm='invalid_state'; end;
 if not failed then raise exception 'Finish replay allowed'; end if;
 -- Expired state never claims or reaches token exchange.
 perform public.social_x_oauth_begin(w,owner_id,h2,'verifier');
 update public.social_x_oauth_states set expires_at=now()-interval '1 second' where state_hash=h2;
 failed=false;
 begin perform public.social_x_oauth_claim(h2); exception when others then failed=sqlerrm='invalid_state'; end;
 if not failed then raise exception 'Expired state allowed'; end if;
 -- Metadata revision changes between claim and token commit must not overwrite tokens.
 perform public.social_x_oauth_begin(w,owner_id,h3,'verifier'); perform public.social_x_oauth_claim(h3);
 update public.social_integrations set app_id='changed-client' where id=i;
 failed=false;
 begin perform public.social_x_oauth_finish(h3,'racing-access','racing-refresh',now()+interval '2 hours','1234','fixture_user'); exception when others then failed=sqlerrm='invalid_state'; end;
 if not failed then raise exception 'Config race committed'; end if;
 if (select access_token from public.social_integration_secrets where integration_id=i)<>'fixture-access' then raise exception 'Failed callback destroyed working token'; end if;
 if (select status from public.social_integrations where id=i)<>'needs_review'
   or exists(select 1 from public.social_x_oauth_configs c where c.integration_id=i and c.token_revision=c.revision)
   then raise exception 'Changed client incorrectly remained connected'; end if;
 failed=false;
 begin perform public.social_x_oauth_refresh_claim(w,owner_id,lease); exception when others then failed=sqlerrm='not_connected'; end;
 if not failed then raise exception 'Old-client token refreshed under new config'; end if;
 -- Re-authenticate the new config before the subsequent refresh/race tests.
 perform public.social_x_oauth_begin(w,owner_id,h3,'verifier'); perform public.social_x_oauth_claim(h3);
 perform public.social_x_oauth_finish(h3,'fixture-access','fixture-refresh',now()+interval '2 hours','1234','fixture_user');
 -- Refresh single lease, compare-and-swap, rotated token retained.
 delete from public.social_x_oauth_states where integration_id=i;
 config=public.social_x_oauth_refresh_claim(w,owner_id,lease);
 failed=false;
 begin perform public.social_x_oauth_refresh_finish(i,owner_id,null,null,null,'unleased','unleased',now()+interval '2 hours','1234','fixture_user');
   exception when others then failed=sqlerrm='invalid_state'; end;
 if not failed then raise exception 'NULL lease/version bypassed CAS'; end if;
 failed=false;
 begin perform public.social_x_oauth_refresh_claim(w,owner_id,gen_random_uuid()); exception when others then failed=sqlerrm='busy'; end;
 if not failed then raise exception 'Concurrent refresh allowed'; end if;
 failed=false;
 begin perform public.social_x_oauth_refresh_finish(i,owner_id,lease,(config->>'revision')::uuid,(config->>'version')::bigint+1,'wrong','wrong',now()+interval '2 hours','1234','fixture_user'); exception when others then failed=sqlerrm='invalid_state'; end;
 if not failed then raise exception 'Token version race allowed'; end if;
 perform public.social_x_oauth_refresh_finish(i,owner_id,lease,(config->>'revision')::uuid,(config->>'version')::bigint,'new-access','rotated-refresh',now()+interval '2 hours','1234','fixture_user');
 if (select refresh_token from public.social_integration_secrets where integration_id=i)<>'rotated-refresh' then raise exception 'Rotated refresh token lost'; end if;
 -- Same committed lease/payload can be safely retried after a lost network response.
 perform public.social_x_oauth_refresh_finish(i,owner_id,lease,(config->>'revision')::uuid,(config->>'version')::bigint,'new-access','rotated-refresh',now()+interval '2 hours','1234','fixture_user');
 if (select token_version from public.social_x_oauth_configs where integration_id=i)<>(config->>'version')::bigint+1
   then raise exception 'Idempotent refresh retry wrote credentials twice'; end if;
 -- Legacy updates with omitted token fields preserve the newly rotated credentials.
 perform public.social_integration_secrets_mutate(w,owner_id,'x','save','','','','fixture-webhook');
 if (select refresh_token from public.social_integration_secrets where integration_id=i)<>'rotated-refresh'
    or (select access_token from public.social_integration_secrets where integration_id=i)<>'new-access'
   then raise exception 'Legacy save overwrote omitted rotated credentials'; end if;
 failed=false;
 begin perform public.social_integration_secrets_mutate(w,outsider,'x','delete','','','','');
   exception when others then failed=sqlerrm='forbidden'; end;
 if not failed then raise exception 'Nonmember legacy deletion allowed'; end if;
 failed=false;
 begin perform public.social_x_oauth_refresh_finish(i,owner_id,lease,(config->>'revision')::uuid,(config->>'version')::bigint,'wrong','wrong',now()+interval '2 hours','1234','fixture_user'); exception when others then failed=sqlerrm='invalid_state'; end;
 if not failed then raise exception 'Refresh finish replay allowed'; end if;
 -- Expired leases cannot commit. A stale release cannot unlock a newer lease.
 config=public.social_x_oauth_refresh_claim(w,owner_id,lease);
 update public.social_x_oauth_configs set refresh_lease_expires_at=now()-interval '1 second' where integration_id=i;
 failed=false;
 begin perform public.social_x_oauth_refresh_finish(i,owner_id,lease,(config->>'revision')::uuid,(config->>'version')::bigint,'expired','expired',now()+interval '2 hours','1234','fixture_user'); exception when others then failed=sqlerrm='invalid_state'; end;
 if not failed then raise exception 'Expired refresh lease committed'; end if;
 config=public.social_x_oauth_refresh_claim(w,owner_id,newer_lease);
 perform public.social_x_oauth_refresh_release(i,lease);
 if (select refresh_lease from public.social_x_oauth_configs where integration_id=i)<>newer_lease then raise exception 'Stale release unlocked new refresh'; end if;
 perform public.social_x_oauth_refresh_release(i,newer_lease);
 -- Re-check initiating membership when committing, not just at authorization start.
 insert into public.social_workspace_members(workspace_id,user_id) values(w,outsider);
 perform public.social_x_oauth_begin(w,outsider,h2,'verifier'); perform public.social_x_oauth_claim(h2);
 delete from public.social_workspace_members where workspace_id=w and user_id=outsider;
 failed=false;
 begin perform public.social_x_oauth_finish(h2,'revoked','revoked',now()+interval '2 hours','1234','fixture_user'); exception when others then failed=sqlerrm='invalid_state'; end;
 if not failed then raise exception 'Revoked initiating member committed callback'; end if;
 perform public.social_x_oauth_cancel(h2);
 if (select access_token from public.social_integration_secrets where integration_id=i)<>'new-access' then raise exception 'Failed callback or refresh changed tokens'; end if;
 insert into public.social_workspace_members(workspace_id,user_id) values(w,outsider);
 config=public.social_x_oauth_refresh_claim(w,outsider,lease);
 delete from public.social_workspace_members where workspace_id=w and user_id=outsider;
 failed=false;
 begin perform public.social_x_oauth_refresh_finish(i,outsider,lease,(config->>'revision')::uuid,(config->>'version')::bigint,'revoked','revoked',now()+interval '2 hours','1234','fixture_user'); exception when others then failed=sqlerrm='invalid_state'; end;
 if not failed then raise exception 'Revoked initiating member committed refresh'; end if;
 perform public.social_x_oauth_refresh_release(i,lease);
 -- Legacy secret changes invalidate already-claimed callback and preserve the manual update.
 perform public.social_x_oauth_begin(w,owner_id,h,'verifier'); perform public.social_x_oauth_claim(h);
 update public.social_integration_secrets set access_token='manual-access' where integration_id=i;
 failed=false;
 begin perform public.social_x_oauth_finish(h,'wrong','wrong',now()+interval '2 hours','1234','fixture_user'); exception when others then failed=sqlerrm='invalid_state'; end;
 if not failed then raise exception 'Legacy token race allowed'; end if;
 -- Delete/recreate cannot resurrect old state.
 delete from public.social_integrations where id=i;
 i=public.social_x_oauth_configure(w,owner_id,'new-client','','tweet.read tweet.write users.read offline.access','https://fixture.invalid/cb');
 failed=false;
 begin perform public.social_x_oauth_claim(h); exception when others then failed=sqlerrm='invalid_state'; end;
 if not failed then raise exception 'Deleted integration state resurrected'; end if;
 delete from public.social_workspaces where id=w;
end $$;
SELECT 'OAuth security and token rotation assertions passed' AS result;
