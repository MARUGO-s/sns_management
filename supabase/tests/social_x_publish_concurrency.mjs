// Independent PostgreSQL connections inside the temporary test container only.
import {spawn, spawnSync} from "node:child_process";

function command(container) {
  return ["exec", "-i", container, "psql", "-h", "127.0.0.1", "-U", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"];
}
function sql(container, input) {
  const result = spawnSync("docker", command(container), {input, encoding: "utf8"});
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "SQL failed");
  return result.stdout;
}
function connection(container, input) {
  const child = spawn("docker", command(container), {stdio: ["pipe", "pipe", "pipe"]});
  let output = "", error = "";
  child.stdout.on("data", (chunk) => output += chunk);
  child.stderr.on("data", (chunk) => error += chunk);
  const done = new Promise((resolve) => child.on("close", (status) => resolve({status, output, error})));
  if (input) child.stdin.end(input);
  return {done, write: (text) => child.stdin.write(text), close: (text) => child.stdin.end(text)};
}
async function waitFor(container, application, condition) {
  for (let i = 0; i < 100; i++) {
    if (/\n\s+1\s*\n/.test(sql(container, `select count(*) from pg_stat_activity where application_name='${application}' and ${condition};`))) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Connection did not reach expected barrier: ${application}`);
}
async function gate(container, key) {
  const client = connection(container);
  client.write(`begin;set application_name='x_publish_gate_${key}';select pg_advisory_xact_lock(${key});\n`);
  await waitFor(container, `x_publish_gate_${key}`, "state='idle in transaction'");
  return async () => {
    client.close("commit;\n");
    const result = await client.done;
    if (result.status !== 0) throw new Error(result.error);
  };
}
export async function assertPublishConcurrency(container) {
  const w = "10000000-0000-4000-8000-000000000088";
  const post = "20000000-0000-4000-8000-000000000088";
  const owner = "00000000-0000-4000-8000-000000000002";
  const member = "00000000-0000-4000-8000-000000000003";
  const request = "30000000-0000-4000-8000-000000000088";
  const lease = "40000000-0000-4000-8000-000000000088";
  sql(container, `
    insert into public.social_workspaces(id,name,created_by) values('${w}','Publication race fixture','${owner}');
    insert into public.social_posts(id,workspace_id,title,body,created_by) values('${post}','${w}','Synthetic','Synthetic','${owner}');
    insert into public.social_post_channels(post_id,channel) values('${post}','x');
    insert into public.social_workspace_members(workspace_id,user_id,role) values('${w}','${member}','member');
    insert into storage.objects(bucket_id,name) values('social-post-files','${w}/${post}/synthetic.png');
    select public.social_x_oauth_configure('${w}','${owner}','synthetic-client','','tweet.read tweet.write users.read offline.access','https://fixture.invalid/cb');
    select public.social_x_oauth_begin('${w}','${owner}',repeat('8',64),'synthetic-verifier');
    select public.social_x_oauth_claim(repeat('8',64));
    select public.social_x_oauth_finish(repeat('8',64),'synthetic-access','synthetic-refresh',now()+interval '2 hours','888','synthetic');
  `);
  // Competing request keys must serialize through the post lock and return only one claim.
  const releaseClaim = await gate(container, 991101);
  const first = connection(container, `
    begin;set application_name='x_publish_first';
    do $$declare a jsonb;begin a=public.test_x_publish_prepare('${post}','${member}','${request}','{}','${lease}');
    if not (a->>'claimed')::boolean then raise exception 'First claim failed';end if;end $$;
    select pg_advisory_xact_lock(991101);commit;`);
  await waitFor(container, "x_publish_first", "wait_event_type='Lock'");
  const competing = connection(container, `
    set application_name='x_publish_competing';
    do $$declare a jsonb;begin a=public.test_x_publish_prepare('${post}','${owner}',gen_random_uuid(),'{}',gen_random_uuid());
    if (a->>'claimed')::boolean or a ? 'body' or a ? 'files' then raise exception 'Concurrent request gained claim or private data';end if;end $$;`);
  await waitFor(container, "x_publish_competing", "wait_event_type='Lock'");
  const edit = connection(container, `set application_name='x_publish_edit';update public.social_posts set body='Changed' where id='${post}';`);
  await waitFor(container, "x_publish_edit", "wait_event_type='Lock'");
  const storage = connection(container, `set application_name='x_publish_storage_delete';
    delete from storage.objects where bucket_id='social-post-files' and name='${w}/${post}/synthetic.png';`);
  await waitFor(container, "x_publish_storage_delete", "wait_event_type='Lock'");
  await releaseClaim();
  const results = await Promise.all([first.done, competing.done, edit.done, storage.done]);
  if (results[0].status !== 0 || results[1].status !== 0 ||
    results.slice(2).some((result) => result.status === 0 || !result.error.includes("publication_locked"))) {
    throw new Error("Concurrent claim/mutation fence failed");
  }
  // Membership remains locked until a successful token transaction commits.
  const releaseMember = await gate(container, 991102);
  const token = connection(container, `begin;set application_name='x_publish_member_token';
    do $$declare a uuid;begin select id into a from public.social_x_publication_attempts where post_id='${post}';
    perform public.social_x_publish_token(a,'${member}','${lease}');end $$;
    select pg_advisory_xact_lock(991102);commit;`);
  await waitFor(container, "x_publish_member_token", "wait_event_type='Lock'");
  const revoke = connection(container, `set application_name='x_publish_revoke';
    delete from public.social_workspace_members where workspace_id='${w}' and user_id='${member}';`);
  await waitFor(container, "x_publish_revoke", "wait_event_type='Lock'");
  await releaseMember();
  const revoked = await Promise.all([token.done, revoke.done]);
  if (revoked.some((r) => r.status !== 0)) throw new Error("Membership transaction fence failed");
  sql(container, `do $$declare a uuid;blocked boolean=false;begin
    select id into a from public.social_x_publication_attempts where post_id='${post}';
    begin perform public.social_x_publish_dispatch(a,'${member}','${lease}');
    exception when others then blocked=sqlerrm='forbidden';end;
    if not blocked then raise exception 'Revoked member dispatched';end if;end $$;`);
  sql(container, `insert into public.social_workspace_members(workspace_id,user_id,role) values('${w}','${member}','member');`);
  // Config mutation cannot slip between token revalidation and durable dispatch commit.
  const releaseDispatch = await gate(container, 991103);
  const dispatch = connection(container, `begin;set application_name='x_publish_dispatch';
    do $$declare a uuid;begin select id into a from public.social_x_publication_attempts where post_id='${post}';
    perform public.social_x_publish_dispatch(a,'${member}','${lease}');end $$;
    select pg_advisory_xact_lock(991103);commit;`);
  await waitFor(container, "x_publish_dispatch", "wait_event_type='Lock'");
  const config = connection(container, `set application_name='x_publish_config';
    update public.social_integrations set app_id='changed' where workspace_id='${w}' and channel='x';`);
  await waitFor(container, "x_publish_config", "wait_event_type='Lock'");
  await releaseDispatch();
  const dispatched = await Promise.all([dispatch.done, config.done]);
  if (dispatched.some((r) => r.status !== 0)) throw new Error("Config/dispatch transaction fence failed");
  sql(container, `delete from public.social_workspace_members where workspace_id='${w}' and user_id='${member}';
    do $$declare a uuid;begin select id into a from public.social_x_publication_attempts where post_id='${post}';
    perform public.social_x_publish_finish(a,'${lease}','published','88888',null);
    if not exists(select 1 from public.social_x_publication_attempts where id=a and state='published')
    then raise exception 'Revocation discarded known success';end if;end $$;`);
  console.log("X publication independent-connection concurrency assertions passed");
}
