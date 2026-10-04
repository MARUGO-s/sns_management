// Real independent PostgreSQL connections, using only an isolated fixture container.
import {spawn,spawnSync} from 'node:child_process';
const w='10000000-0000-4000-8000-000000000098';
const owner='00000000-0000-4000-8000-000000000002';
const member='00000000-0000-4000-8000-000000000003';
function command(container) {return ['exec','-i',container,'psql','-h','127.0.0.1','-U','postgres','-X','-q','-v','ON_ERROR_STOP=1','-f','-'];}
function sql(container,input) {
 const result=spawnSync('docker',command(container),{input,encoding:'utf8'});
 if(result.status!==0)throw new Error(result.stderr||result.stdout||'SQL failed');return result.stdout;
}
function connection(container) {
 const child=spawn('docker',command(container),{stdio:['pipe','pipe','pipe']});let output='',error='';
 child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);
 const done=new Promise(resolve=>child.on('close',status=>resolve({status,output,error})));
 return {done,write:input=>child.stdin.write(input),close:input=>child.stdin.end(input)};
}
function background(container,input) {const client=connection(container);client.close(input);return client;}
async function gate(container,key) {
 const client=connection(container);
 client.write(`begin;set application_name='x_oauth_gate_${key}';select pg_advisory_xact_lock(${key});\n`);
 await waitFor(container,`x_oauth_gate_${key}`,"state='idle in transaction'");
 return async()=>{client.close('commit;\n');const result=await client.done;if(result.status!==0)throw new Error(result.error);};
}
async function waitFor(container,application,condition) {
 for(let i=0;i<80;i++) {
  const count=sql(container,`select count(*) from pg_stat_activity where application_name='${application}' and ${condition};`);
  if(/\n\s+1\s*\n/.test(count))return;
  await new Promise(resolve=>setTimeout(resolve,25));
 }
 throw new Error(`Connection did not reach expected barrier: ${application}`);
}
export async function assertOAuthConcurrency(container) {
 sql(container,`insert into public.social_workspaces(id,name,created_by) values('${w}','OAuth concurrency fixture','${owner}');
 select public.social_x_oauth_configure('${w}','${owner}','client','','tweet.read tweet.write users.read offline.access','https://fixture.invalid/cb');
 select public.social_x_oauth_begin('${w}','${owner}',repeat('d',64),'verifier');select public.social_x_oauth_claim(repeat('d',64));
 select public.social_x_oauth_finish(repeat('d',64),'initial-access','initial-refresh',now()+interval '2 hours','1234','fixture_user');
 insert into public.social_workspace_members(workspace_id,user_id) values('${w}','${member}');`);
 // A truly stale worker snapshot must not resurrect its omitted old token fields.
 const releaseStale=await gate(container,990041);
 const stale=background(container,`begin;set application_name='x_oauth_stale_legacy';
 select access_token from public.social_integration_secrets s join public.social_integrations i on i.id=s.integration_id where i.workspace_id='${w}';
 select pg_advisory_xact_lock(990041);
 select public.social_integration_secrets_mutate('${w}','${owner}','x','save','','','','new-webhook');commit;`);
 await waitFor(container,'x_oauth_stale_legacy',"wait_event_type='Lock'");
 sql(container,`do $$declare c jsonb;l uuid=gen_random_uuid();begin
 c=public.social_x_oauth_refresh_claim('${w}','${owner}',l);
 perform public.social_x_oauth_refresh_finish((c->>'integrationId')::uuid,'${owner}',l,(c->>'revision')::uuid,(c->>'version')::bigint,'rotated-access','rotated-refresh',now()+interval '2 hours','1234','fixture_user');end $$;`);
 await releaseStale();
 const staleResult=await stale.done;if(staleResult.status!==0)throw new Error(staleResult.error);
 sql(container,`do $$begin if not exists(select 1 from public.social_integration_secrets s join public.social_integrations i on i.id=s.integration_id
 where i.workspace_id='${w}' and s.access_token='rotated-access' and s.refresh_token='rotated-refresh' and s.webhook_secret='new-webhook')
 then raise exception 'Stale concurrent legacy save overwrote rotation';end if;end $$;`);
 // Membership removed after a request's earlier authorization read is rechecked by the mutation.
 const releaseRemoved=await gate(container,990042);
 const removed=background(container,`begin;set application_name='x_oauth_removed_member';
 select user_id from public.social_workspace_members where workspace_id='${w}' and user_id='${member}';select pg_advisory_xact_lock(990042);
 select public.social_integration_secrets_mutate('${w}','${member}','x','delete','','','','');commit;`);
 await waitFor(container,'x_oauth_removed_member',"wait_event_type='Lock'");
 sql(container,`delete from public.social_workspace_members where workspace_id='${w}' and user_id='${member}';`);
 await releaseRemoved();
 const removedResult=await removed.done;
 if(removedResult.status===0 || !removedResult.error.includes('forbidden'))throw new Error('Removed member mutation was not rejected');
 sql(container,`insert into public.social_workspace_members(workspace_id,user_id) values('${w}','${member}');`);
 // Authorization remains locked through commit, so concurrent membership deletion cannot slip
 // between the SQL membership check and credential mutation.
 const releaseLocked=await gate(container,990043);
 const locked=background(container,`begin;set application_name='x_oauth_locked_member';
 select public.social_integration_secrets_mutate('${w}','${member}','x','save','','','','locked-webhook');select pg_advisory_xact_lock(990043);commit;`);
 await waitFor(container,'x_oauth_locked_member',"wait_event_type='Lock'");
 const revoke=background(container,`set application_name='x_oauth_member_revoke';delete from public.social_workspace_members where workspace_id='${w}' and user_id='${member}';`);
 await waitFor(container,'x_oauth_member_revoke',"wait_event_type='Lock'");
 await releaseLocked();
 const lockedResult=await locked.done,revokeResult=await revoke.done;
 if(lockedResult.status!==0 || revokeResult.status!==0)throw new Error(lockedResult.error||revokeResult.error);
 sql(container,`do $$begin if not exists(select 1 from public.social_integration_secrets s join public.social_integrations i on i.id=s.integration_id
 where i.workspace_id='${w}' and s.refresh_token='rotated-refresh' and s.webhook_secret='locked-webhook')
 then raise exception 'Locked mutation changed omitted credentials';end if;end $$;
 delete from public.social_workspaces where id='${w}';`);
 console.log('OAuth real multi-connection concurrency assertions passed');
}
