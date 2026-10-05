# X Scheduled Publishing

## Status

The scheduling implementation is local on `feat/x-scheduled-publishing` and has
not been committed, reviewed by CI, merged, deployed, or applied to production.
The current production app therefore does not have scheduled auto-publishing.

The additive migration deliberately creates no cron job and leaves the runtime
readiness marker `enabled=false`. Until a scheduler, worker credential, and
runtime enablement are separately configured, the UI must not enqueue a publish
job. Saving a post with a date/time is not the same as authorizing X publication.

## Scope and opt-in

- Scheduled auto-publishing is X-only. The server verifies that the post has
  exactly the X channel and a future schedule.
- The user explicitly chooses X auto-publishing and confirms the exact post,
  scheduled time, and possibility of X API charges. Other channels remain
  ordinary saved schedules and are never marked published by this worker.
- The queue binds the saved body, ordered original attachment IDs/paths/MIME
  types/sizes/SHA-256 digests, workspace, author, X integration generation,
  account, scopes, and one stable publication request ID.
- Media is limited to the existing conservative contract: JPEG/PNG originals,
  at most four files and 5 MiB each, or one MP4 original up to 20 MiB. Mixed
  image/video and edited/cropped media are rejected. Any attachment requires
  `media.write`; a connection/scope change before send fails closed.
- Runtime processes at most one due post per worker invocation. Claim attempts
  are bounded. Only failures proven to be before X's create-post request may be
  retried with the same request ID. An ambiguous result becomes `unknown` and is
  never automatically sent again.
- Cancellation is available only before a provider send can be in flight. A
  successful cancellation changes the saved post back to a draft and retains
  its content/files. `sending`, `published`, and `unknown` states cannot be
  cancelled or retried as a new send.

## Safety and data boundaries

- Public status rows expose only post ID, state, safe error code, and schedule
  time under workspace-member RLS. Bodies, file digests, connection bindings,
  request IDs, and leases remain in the private schema.
- Browser clients cannot directly write queue or private payload tables.
  Authenticated enqueue/cancel RPCs verify post-editor membership; service-only
  worker RPCs claim, validate, and finish jobs.
- The worker endpoint requires a separately provisioned bearer credential and
  accepts no caller-selected post ID. The scheduler runtime marker is an
  additional database-side gate.
- The worker delegates final publication to the existing X publisher, preserving
  its content/media validation, receipt handling, and no-duplicate behavior.
- No production X API request, upload, token refresh, real post, migration, or
  function deployment was used for local verification.

## Scheduler decision and activation

No periodic trigger is included in the migration or local Supabase config.
Before production use, choose and approve an invocation method:

1. **Supabase Cron (recommended):** schedule the Edge Function from the existing
   backend. Follow the [Supabase scheduled Edge Functions guide](<https://supabase.com/docs/guides/functions/schedule-functions>).
   It keeps the trigger close to the queue and avoids depending on a source-code
   repository runner. Verify the active Supabase plan/usage before enabling.
2. **GitHub Actions:** use a repository workflow to invoke the protected
   endpoint. Review GitHub's [workflow schedule syntax](<https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax>)
   and [schedule-delay guidance](<https://docs.github.com/en/actions/how-tos/troubleshoot-workflows>).
   This adds a GitHub runner/secret dependency and should not be treated as
   second-accurate execution.

Activation must be a separate reviewed operation: apply only this SNS-specific
migration, deploy only `social-x-schedule-worker`, provision the worker
credential through the secure secret manager, configure one periodic trigger,
and only then flip the runtime marker. Do not use `db push/reset`, modify shared
Auth, unrelated Functions/secrets, or Cloud Run. Keep the marker disabled until
all configuration is verified. Before activation, inspect pending X schedules
and tell the user what could publish and when. This local change does none of
those production operations.

The worker currently handles one due item per invocation, so posts that become
due together can be delayed while earlier items finish. Change the batch model
only with concurrency/idempotency tests.

## Local verification

- `npm test`: 53/53 passed.
- `npm run test:db:x-schedule`: isolated PostgreSQL permission, state-transition,
  claim/cancel/enqueue race, and dispatch/stale-sweep NOWAIT lock-race assertions
  passed with synthetic fixtures.
- `deno test --no-config supabase/functions/_shared/x-schedule-handler_test.ts`:
  13/13 passed; worker `deno check` passed.
- Existing X publisher Deno tests: 31/31 passed; publisher function `deno check`
  passed.
- `npx tsc --noEmit` and `npm run build:github-pages`: passed.
- `npm run lint`: no errors; one React Hook dependency warning remains.
- Graphify was previously refreshed (709 nodes, 999 edges, 59 communities), and
  `npm run knowledge:check` passed at that point. Later scheduling edits make
  generated graph outputs stale; rerun `npm run knowledge:update` and
  `npm run knowledge:check` before closure. Handwritten Vault design notes were
  not changed.
- No real X/provider calls, token refresh, post/upload, production database,
  Edge Function, scheduler, or billing setting was touched.
- Independent read-only re-review confirmed the fix that fails closed when
  reservation-state reading fails; no new release blocker was found. This is
  local code review, not production verification. The branch remains
  uncommitted and undeployed, with the runtime marker disabled and no Cron job.
