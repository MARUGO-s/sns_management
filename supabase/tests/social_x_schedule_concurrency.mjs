// Independent connections in the temporary database only.
import {spawn, spawnSync} from "node:child_process";

function args(container) {
  return ["exec","-i",container,"psql","-h","127.0.0.1","-U","postgres","-X","-q","-t","-A","-v","ON_ERROR_STOP=1","-f","-"];
}
function sql(container,input) {
  const result=spawnSync("docker",args(container),{input,encoding:"utf8"});
  if(result.status!==0) throw new Error(result.stderr||result.stdout||"SQL failed");
  return result.stdout.trim();
}
function connection(container,input) {
  const child=spawn("docker",args(container),{stdio:["pipe","pipe","pipe"]});
  let output="",error="";
  child.stdout.on("data",(chunk)=>output+=chunk);
  child.stderr.on("data",(chunk)=>error+=chunk);
  const done=new Promise((resolve)=>child.on("close",(status)=>resolve({status,output,error})));
  if(input) child.stdin.end(input);
  return {done,write:(text)=>child.stdin.write(text),close:(text)=>child.stdin.end(text)};
}
async function waitFor(container,application,condition) {
  for(let i=0;i<120;i++) {
    if(sql(container,`select count(*) from pg_stat_activity where application_name='${application}' and ${condition};`)==="1") return;
    await new Promise((resolve)=>setTimeout(resolve,25));
  }
  throw new Error(`Connection did not reach expected scheduler-race barrier: ${application}`);
}
async function gate(container,key) {
  const client=connection(container);
  client.write(`begin;set application_name='x_schedule_gate_${key}';select pg_advisory_xact_lock(${key});\n`);
  await waitFor(container,`x_schedule_gate_${key}`,"state='idle in transaction'");
  return async()=>{
    client.close("commit;\n");
    const result=await client.done;
    if(result.status!==0) throw new Error(result.error);
  };
}
function assertSuccess(result,label) {
  if(result.status!==0) throw new Error(`${label} failed: ${result.error||result.output}`);
}
function expectSqlFailure(container,input,expected,label) {
  const result=spawnSync("docker",args(container),{input,encoding:"utf8"});
  const output=result.stderr||result.stdout||"";
  if(result.status===0 || !output.includes(expected)) {
    throw new Error(`${label} did not fail closed with ${expected}`);
  }
}
async function waitForScalar(container,query,expected,label) {
  for(let attempt=0;attempt<240;attempt++) {
    if(sql(container,query)===expected) return;
    await new Promise((resolve)=>setTimeout(resolve,25));
  }
  throw new Error(`${label} did not reach ${expected}`);
}
async function within(promise,milliseconds,label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_,reject)=>timer=setTimeout(
        ()=>reject(new Error(`${label} timed out after ${milliseconds}ms`)),milliseconds
      )),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function assertScheduleConcurrency(container) {
  const claimPost="20000000-0000-4000-8000-000000000098";
  const cancelPost="20000000-0000-4000-8000-000000000099";
  const enqueueRacePost="20000000-0000-4000-8000-000000000100";
  const owner="00000000-0000-4000-8000-000000000002";

  // Hold the claim trigger after the worker has locked the queue row. A racing
  // cancellation must wait, then observe `claimed` and fail closed.
  sql(container,`
    create function public.test_pause_x_schedule_claim() returns trigger
      language plpgsql as $$
      begin
        if old.state='queued' and new.state='claimed' then perform pg_advisory_xact_lock(991201); end if;
        return new;
      end $$;
    create trigger test_pause_x_schedule_claim before update on public.social_x_scheduled_publications
      for each row execute function public.test_pause_x_schedule_claim();
  `);
  const releaseClaimGate=await gate(container,991201);
  const claim=connection(container,`
    begin;set application_name='x_schedule_claim_first';set role service_role;
    select public.social_x_schedule_claim_due();commit;
  `);
  try {
    await waitFor(container,"x_schedule_claim_first","wait_event_type='Lock' and wait_event='advisory'");
    const cancel=connection(container,`
      begin;set application_name='x_schedule_cancel_after_claim';
      set request.jwt.claim.sub='${owner}';set role authenticated;
      select public.social_x_schedule_cancel('${claimPost}');commit;
    `);
    await waitFor(container,"x_schedule_cancel_after_claim","wait_event_type='Lock'");
    await releaseClaimGate();
    const [claimed,cancelled]=await Promise.all([claim.done,cancel.done]);
    assertSuccess(claimed,"Due-claim transaction");
    if(cancelled.status===0 || !cancelled.error.includes("busy")) {
      throw new Error("Cancellation raced past an already-claimed X publication");
    }
    if(!claimed.output.includes(claimPost) ||
      sql(container,`select state from public.social_x_scheduled_publications where post_id='${claimPost}';`)!=="claimed") {
      throw new Error("Claim winner was not durably recorded");
    }
  } catch(error) {
    // Avoid leaking a gate lock if a barrier assertion fails.
    try { await releaseClaimGate(); } catch { /* Already released. */ }
    const claimResult=await claim.done;
    throw new Error(`${error.message}; claim exit=${claimResult.status}; stderr=${claimResult.error.trim()}; stdout=${claimResult.output.trim()}`);
  } finally {
    sql(container,`
      drop trigger if exists test_pause_x_schedule_claim on public.social_x_scheduled_publications;
      drop function if exists public.test_pause_x_schedule_claim();
    `);
  }

  // In the opposite ordering, cancellation holds the row lock first. SKIP LOCKED
  // must make the due worker return no claim, and the draft is restored.
  sql(container,`
    create function public.test_pause_x_schedule_cancel() returns trigger
      language plpgsql as $$
      begin
        if old.state='queued' and new.state='cancelled' then perform pg_advisory_xact_lock(991202); end if;
        return new;
      end $$;
    create trigger test_pause_x_schedule_cancel before update on public.social_x_scheduled_publications
      for each row execute function public.test_pause_x_schedule_cancel();
  `);
  const releaseCancelGate=await gate(container,991202);
  const cancel=connection(container,`
    begin;set application_name='x_schedule_cancel_first';
    set request.jwt.claim.sub='${owner}';set role authenticated;
    select public.social_x_schedule_cancel('${cancelPost}');commit;
  `);
  try {
    await waitFor(container,"x_schedule_cancel_first","wait_event_type='Lock' and wait_event='advisory'");
    const claim=connection(container,`
      begin;set application_name='x_schedule_claim_after_cancel';
      set role service_role;select public.social_x_schedule_claim_due();commit;
    `);
    const claimed=await claim.done;
    assertSuccess(claimed,"SKIP LOCKED due-claim transaction");
    if(claimed.output.trim()!=="" && claimed.output.trim()!=="null") {
      throw new Error("Due worker claimed a reservation whose cancellation had already locked it");
    }
    await releaseCancelGate();
    const cancelled=await cancel.done;
    assertSuccess(cancelled,"Cancellation winner");
    const final=sql(container,`select s.state||':'||p.status||':'||(p.scheduled_at is null)::text
      from public.social_x_scheduled_publications s join public.social_posts p on p.id=s.post_id
      where s.post_id='${cancelPost}';`);
    if(final!=="cancelled:draft:true") throw new Error(`Cancellation result was not atomic: ${final}`);
    const attempt=sql(container,`select state||':'||coalesce(error_code,'')
      from public.social_x_publication_attempts where post_id='${cancelPost}';`);
    if(attempt!=="rejected:schedule_cancelled") {
      throw new Error(`Preparing publication attempt was not safely terminated: ${attempt}`);
    }
    const media=sql(container,`select (jsonb_array_length(payload.media)=1
      and payload.media->0->>'id'='700099'
      and payload.media->0->>'state'='pending'
      and (payload.media->0->>'expiresAt')::timestamptz>now())::text
      from public.social_x_publication_attempts attempt
      join social_private.x_publication_payloads payload on payload.attempt_id=attempt.id
      where attempt.post_id='${cancelPost}';`);
    if(media!=="true") throw new Error(`Cancellation discarded or changed the pending X media checkpoint/expiry: ${media||"<no row>"}`);
    const binding=sql(container,`select attempt.id||':'||payload.lease
      from public.social_x_publication_attempts attempt
      join social_private.x_publication_payloads payload on payload.attempt_id=attempt.id
      where attempt.post_id='${cancelPost}';`);
    const [attemptId,lease]=binding.split(":");
    if(!attemptId || !lease) throw new Error("Cancelled preparing attempt lost its synthetic lease binding");
    expectSqlFailure(container,`
      set role service_role;
      select public.social_x_publish_dispatch('${attemptId}','${owner}','${lease}');
      reset role;
    `,"busy","Final X publication dispatch after cancellation");
    const payload=sql(container,`select exists(select 1 from social_private.x_scheduled_publication_payloads
      where post_id='${cancelPost}');`);
    if(payload!=="f") throw new Error("Cancelled video wait retained its scheduled publication payload");
    const afterCancel=sql(container,`
      set role service_role;
      select public.social_x_schedule_claim_due();
      reset role;
    `);
    if(afterCancel!=="" && afterCancel!=="null") {
      throw new Error("Worker reclaimed a queued-preparing reservation after cancellation");
    }
  } catch(error) {
    try { await releaseCancelGate(); } catch { /* Already released. */ }
    throw error;
  } finally {
    sql(container,`
      drop trigger if exists test_pause_x_schedule_cancel on public.social_x_scheduled_publications;
      drop function if exists public.test_pause_x_schedule_cancel();
    `);
  }

  // An ordinary post edit that starts while enqueue is holding the post lock
  // must observe the committed queue row after it wakes, not use a stale snapshot
  // and mutate the content after the schedule was frozen.
  sql(container,`
    create function public.test_pause_x_schedule_enqueue() returns trigger
      language plpgsql as $$
      begin
        if new.post_id='${enqueueRacePost}'::uuid then perform pg_advisory_xact_lock(991203); end if;
        return new;
      end $$;
    create trigger test_pause_x_schedule_enqueue before insert on public.social_x_scheduled_publications
      for each row execute function public.test_pause_x_schedule_enqueue();
  `);
  const releaseEnqueueGate=await gate(container,991203);
  const enqueue=connection(container,`
    begin;set application_name='x_schedule_enqueue_race';
    set request.jwt.claim.sub='${owner}';set role authenticated;
    select public.social_x_schedule_enqueue(
      '${enqueueRacePost}',gen_random_uuid(),
      public.test_x_schedule_expected('${enqueueRacePost}',array[]::uuid[],'${owner}')
    );commit;
  `);
  let edit;
  try {
    await waitFor(container,"x_schedule_enqueue_race","wait_event_type='Lock' and wait_event='advisory'");
    edit=connection(container,`
      begin;set application_name='x_schedule_edit_race';
      set request.jwt.claim.sub='${owner}';set role authenticated;
      update public.social_posts set body='Late concurrent edit' where id='${enqueueRacePost}';
      commit;
    `);
    await waitFor(container,"x_schedule_edit_race","wait_event_type='Lock'");
    await releaseEnqueueGate();
    const [queued,edited]=await Promise.all([enqueue.done,edit.done]);
    assertSuccess(queued,"Enqueue concurrent with post edit");
    if(edited.status===0 || !edited.error.includes("publication_locked")) {
      throw new Error("A concurrent post edit changed payload after schedule enqueue");
    }
    const final=sql(container,`
      select s.state||':'||p.body from public.social_x_scheduled_publications s
      join public.social_posts p on p.id=s.post_id where s.post_id='${enqueueRacePost}';
    `);
    if(final!=="queued:Synthetic body") throw new Error(`Enqueued payload was not frozen: ${final}`);
  } catch(error) {
    try { await releaseEnqueueGate(); } catch { /* Already released. */ }
    const [enqueueResult,editResult]=await Promise.all([
      enqueue.done.catch((cause)=>({status:-1,output:"",error:String(cause)})),
      edit?.done.catch((cause)=>({status:-1,output:"",error:String(cause)})) ??
        Promise.resolve({status:null,output:"",error:"not started"}),
    ]);
    throw new Error(`${error.message}; enqueue exit=${enqueueResult.status}; stderr=${enqueueResult.error.trim()}; stdout=${enqueueResult.output.trim()}; edit exit=${editResult.status}; stderr=${editResult.error.trim()}`);
  } finally {
    sql(container,`
      drop trigger if exists test_pause_x_schedule_enqueue on public.social_x_scheduled_publications;
      drop function if exists public.test_pause_x_schedule_enqueue();
    `);
  }

  // A dispatch transaction takes post -> attempt, then its AFTER trigger updates
  // the schedule. If the claim expires while dispatch holds the attempt lock,
  // the stale sweep must NOWAIT/return instead of waiting on the inverse order.
  const dispatchRacePost="20000000-0000-4000-8000-000000000106";
  sql(container,`
    update public.social_x_scheduled_publications
      set scheduled_at=now()-interval '1 second' where post_id='${dispatchRacePost}';
    update social_private.x_scheduled_publication_payloads
      set next_check_at=now()-interval '1 second' where post_id='${dispatchRacePost}';
    set role service_role;
    do $$
    declare p uuid='${dispatchRacePost}'; owner_id uuid='${owner}';
      result jsonb; expected jsonb; publish_lease uuid=gen_random_uuid();
    begin
      result=public.social_x_schedule_claim_due();
      if result->>'postId' is distinct from p::text then
        raise exception 'Dispatch-race schedule did not claim';
      end if;
      perform public.social_x_schedule_connection(p,(result->>'claimToken')::uuid);
      expected=public.test_x_schedule_expected(p,'{}',owner_id);
      result=public.social_x_publish_prepare(
        p,owner_id,(result->>'requestId')::uuid,array[]::uuid[],publish_lease,expected
      );
      if result->>'state'<>'preparing' or result->>'claimed'<>'true' then
        raise exception 'Dispatch-race attempt did not prepare';
      end if;
    end $$;
    reset role;
    update social_private.x_scheduled_publication_payloads
      set claim_count=12,claim_expires_at=now()+interval '5 seconds'
      where post_id='${dispatchRacePost}';
  `);
  const binding=sql(container,`
    select attempt.id||':'||payload.lease
    from public.social_x_publication_attempts attempt
    join social_private.x_publication_payloads payload on payload.attempt_id=attempt.id
    where attempt.post_id='${dispatchRacePost}' and attempt.state='preparing';
  `);
  const [dispatchAttempt,dispatchLease]=binding.split(":");
  if(!dispatchAttempt || !dispatchLease) throw new Error("Dispatch-race attempt lost its synthetic lease");
  sql(container,`
    create function public.test_pause_x_schedule_dispatch() returns trigger
      language plpgsql as $$
      begin
        if old.post_id='${dispatchRacePost}'::uuid
          and old.state='preparing' and new.state='sending'
          then perform pg_advisory_xact_lock(991204); end if;
        return new;
      end $$;
    create trigger test_pause_x_schedule_dispatch before update of state
      on public.social_x_publication_attempts for each row
      execute function public.test_pause_x_schedule_dispatch();
  `);
  const releaseDispatchGate=await gate(container,991204);
  const dispatch=connection(container,`
    begin;
    set application_name='x_schedule_dispatch_attempt_first';
    set role service_role;
    do $$
    begin
      if now() >= jsonb_extract_path_text(
        public.test_x_schedule_snapshot('${dispatchRacePost}'),'claimExpiresAt'
      )::timestamptz
        then raise exception 'Dispatch test did not begin before claim expiry'; end if;
      perform public.social_x_publish_dispatch(
        '${dispatchAttempt}','${owner}','${dispatchLease}'
      );
    end $$;
    commit;
  `);
  let dispatchGateReleased=false;
  let staleSweep;
  try {
    await waitFor(container,"x_schedule_dispatch_attempt_first",
      "wait_event_type='Lock' and wait_event='advisory'");
    await waitForScalar(container,`
      select (claim_expires_at<=now())::text
      from social_private.x_scheduled_publication_payloads
      where post_id='${dispatchRacePost}';
    `,"true","Dispatch-race claim expiry");
    staleSweep=connection(container,`
      begin;
      set application_name='x_schedule_stale_sweep_during_dispatch';
      set role service_role;
      do $$
      begin
        if public.social_x_schedule_claim_due() is not null then
          raise exception 'Stale sweep claimed work while dispatch was in flight';
        end if;
      end $$;
      commit;
    `);
    const swept=await within(staleSweep.done,2500,"Stale sweep competing with dispatch");
    assertSuccess(swept,"NOWAIT stale sweep");
    await releaseDispatchGate();
    dispatchGateReleased=true;
    const dispatched=await dispatch.done;
    assertSuccess(dispatched,"Dispatch holding attempt before schedule transition");
    const dispatchState=sql(container,`
      select schedule.state||':'||attempt.state
      from public.social_x_scheduled_publications schedule
      join public.social_x_publication_attempts attempt using(post_id)
      where schedule.post_id='${dispatchRacePost}';
    `);
    if(dispatchState!=="sending:sending") {
      throw new Error(`Dispatch did not finish its schedule transition: ${dispatchState}`);
    }
    const terminal=sql(container,`
      set role service_role;
      select public.social_x_schedule_claim_due();
      reset role;
    `);
    if(terminal!=="" && terminal!=="null") {
      throw new Error("Expired in-flight dispatch was unexpectedly reclaimed");
    }
    const terminalState=sql(container,`
      select schedule.state||':'||schedule.error_code
      from public.social_x_scheduled_publications schedule
      where schedule.post_id='${dispatchRacePost}';
    `);
    if(terminalState!=="unknown:unknown_result") {
      throw new Error(`Expired in-flight dispatch was not fenced as unknown: ${terminalState}`);
    }
  } catch(error) {
    if(!dispatchGateReleased) {
      try { await releaseDispatchGate(); dispatchGateReleased=true; } catch { /* Already released. */ }
    }
    const [dispatchResult,sweepResult]=await Promise.all([
      dispatch.done.catch((cause)=>({status:-1,output:"",error:String(cause)})),
      staleSweep?.done.catch((cause)=>({status:-1,output:"",error:String(cause)})) ??
        Promise.resolve({status:null,output:"",error:"not started"}),
    ]);
    throw new Error(`${error.message}; dispatch exit=${dispatchResult.status}; stderr=${dispatchResult.error.trim()}; sweep exit=${sweepResult.status}; stderr=${sweepResult.error.trim()}`);
  } finally {
    if(!dispatchGateReleased) {
      try { await releaseDispatchGate(); } catch { /* Already released. */ }
    }
    sql(container,`
      drop trigger if exists test_pause_x_schedule_dispatch on public.social_x_publication_attempts;
      drop function if exists public.test_pause_x_schedule_dispatch();
    `);
  }

  // If a worker dies before creating any publication attempt, the expired
  // claim is safe to requeue with the original request ID after a backoff.
  sql(container,`
    update social_private.x_scheduled_publication_payloads
      set claim_expires_at=now()-interval '1 second'
      where post_id='${claimPost}';
  `);
  const released=sql(container,`
    set role service_role;
    select public.social_x_schedule_claim_due();
    reset role;
  `);
  if(released!=="" && released!=="null") {
    throw new Error("Expired pre-send claim was immediately reclaimed instead of backed off");
  }
  const releasedState=sql(container,`
    select s.state||':'||(p.claim_token is null)::text||':'||
      (p.next_check_at>now())::text
    from public.social_x_scheduled_publications s
    join social_private.x_scheduled_publication_payloads p using(post_id)
    where s.post_id='${claimPost}';
  `);
  if(releasedState!=="queued:true:true") {
    throw new Error(`Expired pre-send claim was not safely released: ${releasedState}`);
  }
  sql(container,`
    update social_private.x_scheduled_publication_payloads
      set next_check_at=now()-interval '1 second'
      where post_id='${claimPost}';
  `);
  const retried=sql(container,`
    set role service_role;
    select public.social_x_schedule_claim_due();
    reset role;
  `);
  if(!retried.includes(claimPost) || !retried.includes("requestId")) {
    throw new Error("Released pre-send job could not be reclaimed");
  }
  const retryToken=sql(container,`
    select claim_token from social_private.x_scheduled_publication_payloads
    where post_id='${claimPost}';
  `);
  if(!/^[0-9a-f-]{36}$/i.test(retryToken)) throw new Error("Reclaimed job has no fresh lease");
  sql(container,`
    set role service_role;
    select public.social_x_schedule_finish(
      '${claimPost}','${retryToken}','unknown','unknown_result',null
    );
    reset role;
  `);
  const terminal=sql(container,`
    set role service_role;
    select public.social_x_schedule_claim_due();
    reset role;
  `);
  const terminalState=sql(container,`
    select state||':'||error_code from public.social_x_scheduled_publications
    where post_id='${claimPost}';
  `);
  if((terminal!=="" && terminal!=="null") || terminalState!=="unknown:unknown_result") {
    throw new Error("Ambiguous publication result was not terminally blocked from retry");
  }
  console.log("X schedule independent-connection claim/cancel race assertions passed");
}
