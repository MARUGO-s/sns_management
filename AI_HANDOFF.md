# Instatic TalksX Handoff

## Current X scheduled-publishing status

The user authorized continuing the X scheduled-post feature locally. The
uncommitted branch `feat/x-scheduled-publishing` adds an X-only queue, protected
worker, explicit user confirmation, cancellation, and duplicate-safe
state handling. It is not merged or deployed. Its additive migration defaults
the runtime marker to `enabled=false`; there is no Cron job or worker secret.
Do not claim production scheduled posting is available or perform production
database/Function/scheduler changes without a separately reviewed activation.

Local verification after installing Deno: Node suite 53/53; scheduler Deno
tests 13/13 and worker type check; existing X publisher Deno tests 31/31 and
type check; isolated PostgreSQL permissions/state and independent-connection
claim/cancel/enqueue plus dispatch/stale-sweep NOWAIT races; TypeScript; and
GitHub Pages static build. Lint has no errors and one existing React Hook
dependency warning. The code-only Graphify and generated Dropbox AI environment
were previously refreshed (709 nodes, 999 edges, 59 communities), but the latest
scheduling diff makes the generated graph stale; rerun `knowledge:update` and
`knowledge:check` before closure. Handwritten Vault design notes were not
changed. Independent read-only review found no critical code blocker, and
confirmed the reservation-state read-failure guard fix with no new release
blocker. This is not production verification. No real X/Provider call, post,
upload, token refresh, OAuth, billing change, production migration, Function,
Auth, or Cloud Run operation occurred.

The worker processes at most one due reservation per invocation. Select a
periodic trigger before production: Supabase Cron is the recommended option;
GitHub Actions is an alternative with its own runner and timing dependencies.
This choice is not yet confirmed. See `docs/X_SCHEDULING.md` and the current
schedule entry at the top of `PROJECT_PROGRESS.md`. Do not enable publication
before the user is shown which pending posts could be sent and when.

## 2026-10-04 20:44 JST media configuration saved but not connected (current connection)

Following the user's separate 20:37:55 JST approval, the browser worker saved
`tweet.read tweet.write users.read offline.access media.write` at 20:43:03 JST
and verified the saved notification, unchanged callback/credentials and blank
secret field. Scope configuration invalidates the prior connection; do not keep
claiming the 20:37 four-scope saved connection is currently connected.
The grant target/permissions were checked and Authorize was clicked once, but
X remained disabled with no verified app return/callback/new-token persistence.
At 20:44:36 JST a fresh app tab independently showed X `API設定 要確認`,
five persisted scopes, blank secret and no connection-success indicator.
Current state is configured but not connected; neither text nor media is ready
until reconnection completes. Original grant remains disabled, with no retry
or reload. Root is reporting the obstacle and a retry decision to the user.
Evidence: `../reports/qa/x-manual-publication/media-reauth.txt`. No real posts,
uploads, additional provider tests, billing or backend changes occurred.
Actual posting remains a separate action. The 20:37 UI check below is historical
evidence of the connection/configuration before this separately approved change.

## 2026-10-04 20:37 JST manual publishing published, read-only UI and then-current connection verified

PR #12 https://github.com/MARUGO-s/sns_management/pull/12 passed CI run
https://github.com/MARUGO-s/sns_management/actions/runs/37198676592 at exact
head `dda2c8a4e2f4c7aad364d6a96b8d4ce1734c0e96` and was normally
squash-merged at 20:29 JST as `225c73282ebaeaec618aa5580b2c384462515522`.
Pages run https://github.com/MARUGO-s/sns_management/actions/runs/37198925360
for that same SHA succeeded, checked at 20:32 JST. Concurrent Google sign-in
PR #11 and its flag/docs/tests remain preserved; no force push or backend reapply.

At 20:37 JST a fresh authenticated task tab verified the live manual region,
`Xへ今すぐ投稿`, weighted 0/280 count, original JPEG/PNG four × 5MiB or one
original MP4 20MiB, costs warning, and empty confirmation disabled. Original
app tabs and unsaved composer input were preserved. X settings retain saved
integration/reconnect/delete controls, the unchanged four scopes, fixed
callback, and a blank secret field. These establish saved connection records,
not a fresh provider identity/token validity check; the original grant was
verified at 19:01 JST.

Manual text/images/video code and UI are published. Images/video remain gated
by separately approved `media.write` configuration and reauthorization, never
automatic scope changes. Live scope absence and the explicit warning were
checked without attachment/preview. Media-specific confirmation disabling was
verified only in synthetic QA. No save, upload, post, OAuth, refresh, provider
test call, payment or backend action was performed in the live check.
Google login control was not safely available in the authenticated page, so no
sign-out/new login was attempted; its live control and owner UID/data continuity
are still not verified. Evidence: `../reports/qa/x-manual-publication/live-published.txt`.

Backend versions and unchanged shared boundaries are in the 20:14 record below;
do not reapply. Final combined checks passed 47 Node regressions, 31 publication
Deno mocks, 17 OAuth Deno mocks, 24 UI tests, type checks, isolated DB/concurrency,
Google-flag Pages build and knowledge checks. Independent security/bug reviews
have no blockers. Existing lint warning and 28 dependency audit findings remain.
All 118 tracked source-mirror files matched deployed main at 20:33 JST with
zero conflicts/deletions. Only three repo documents and two manual notes change
at closure, no structural/Graphify regeneration. Use a normal docs PR; root owns
the final conflict-aware mirror sync. Do not recursively log merging this log PR.

Real provider acceptance, posting, upload and production refresh remain untested.
No scheduler or other-SNS publishing was added. At 20:37:55 JST the user separately
approved media permission/reauthorization, now handled by its assigned worker;
the 20:44 follow-up above confirms configuration saved but not connected.
Actual posting is a separate action. Never post
or alter billing automatically. This section supersedes historical pending/unimplemented states.
App: https://marugo-s.github.io/sns_management/.

## 2026-10-04 20:23 JST concurrent Google rollout preserved in feature integration

Before publication, origin/main advanced to `08e7dc70c5b28b5ae0a624f789cdac8aff900553`
(Google sign-in PR #11). The feature merge preserves its Pages public flag,
Google documentation/tests, and both handoff/progress histories. Generated
knowledge outputs were regenerated from the combined source tree, not selected
from one side. X runtime/SQL sources remain unchanged, so no backend redeploy.
The nine initial mirror conflicts all match this committed main, not independent
edits. Source sync uses that known baseline and preserves unrelated mirror files.

Merged local checks: 47 Node regressions, 31 mocked publication tests, function
check, TypeScript, lint with only the existing warning, and static Pages build
with the production Google flag. Knowledge checks/diff checks pass. Feature
PR: https://github.com/MARUGO-s/sns_management/pull/12. Normal CI/exact-head squash
and Pages publication remain pending; never merge unknown heads or bypass checks.


## 2026-10-04 Google login rollout (current Auth status)

The owner manually saved the Google provider on shared gourmet project
`ycsqfajidusuibqljjwr`. The public Auth settings endpoint confirms Google and
email both enabled. The Pages workflow now explicitly enables the existing
Google UI flag; other environments remain opt-in. See `docs/GOOGLE_AUTH.md`.
No DB/RLS, app authorization, X connection, or existing gourmet redirect change.
Provider-enabled is not proof of successful client-secret exchange or completed
login. Owner login and existing UID/store/data continuity still need verification.
This supersedes older notes saying Google is disabled on gourmet.

## 2026-10-04 20:14 JST historical backend deployment, frontend then pending

This overrides the local-only rollout status below. The exact additive migration
`20261004110000_social_x_publications.sql` was applied atomically once to
`ycsqfajidusuibqljjwr`; canonical SHA-256:
`71d9be14c75bf7cbbe5b86aea7abbbb9f07d001b8ba2813addf156a97210051c`.
All six non-SNS schema fingerprints and both prior Storage trigger/ACL
fingerprints remain unchanged. Only the SNS publication Storage fence was added.
Eight metadata checks verified migration recording, RLS, client-write/private
access denial and service-only RPC execution. No production rows were tested.

Only `social-x-publish` (version 1, JWT required), `social-x-oauth` (version 2,
JWT required), and `social-x-oauth-callback` (version 2, JWT false) were deployed.
All six unrelated Functions, including SNS secrets/media jobs, are unchanged.
Unauthenticated publishing/OAuth requests returned 401. Do not reapply this
migration or deploy unrelated Functions. No X calls, posts, uploads, refresh,
reauthorization or payment changes were performed by this implementation task.

Final local checks passed: 45 Node regressions, 31 publication Deno mocks,
17 OAuth Deno mocks, 24 combined UI tests, TypeScript, lint (one existing hook
warning), all shared/OAuth/publication isolated DB and concurrency checks, and
static Pages build. Independent security and bug recovery re-reviews found no
blockers. Synthetic exact desktop/mobile layouts and hydrated async confirmation,
cancel/edit/reconfirm and local-file digest/freeze were verified with mock-only
preview. Final send/upload/persistence and real provider integration remain
untested. Existing dependency audit findings did not increase (28 total);
no unrelated dependency updates were attempted.

Knowledge maps and authorized manual notes were updated; `knowledge:check` and
`git diff --check` passed. Frontend feature PR/CI/Pages and source-mirror sync
are next. Existing four-scope live connection is preserved; `media.write`
configuration/reauthorization and a real post require separate user decisions.
No scheduler was added. Public app: https://marugo-s.github.io/sns_management/.


## 2026-10-04 20:10 JST historical local verification, rollout then pending

User requested manual publishing with text, images and video. Branch:
`feat/x-manual-publishing`, base `640b09688068c833baca56dc620b51e03785be2a`.
No implementation commit/PR or production publishing deployment yet.
The existing live OAuth connection below remains the production baseline.
See `docs/X_PUBLISHING.md` for the bounded contract and official source URLs.

Confirmation binds raw saved body, ordered original-file metadata and SHA-256,
plus an opaque target-connection fingerprint obtained from a DB-only preview.
The initial prepare RPC compares this snapshot before claiming. All original
bytes are checked before any initial refresh/upload. Connection binding is
fixed at prepare; same-key continuation allows its own valid refresh without
resetting the saved account/generation boundary. Only a known rollback of the
initial SQL prepare proves `notStarted`; transport failure or a later absent
status does not prove it. Preserve the request ID on uncertain outcomes.
The durable dispatch gate permits one provider create request, not blind retries.

Initial limits: required weighted-280 text, JPEG/PNG up to 5MiB each and four
images, or one MP4 up to 20MiB; no mixing, processed variants or scheduler.
Video processing waits require an explicit continuation. Media expiry can
shorten, not extend. Existing four-scope connections stay unchanged; images
and video require separately approved `media.write` configuration and
reauthorization. No real posts, media uploads, reauthorization, purchases,
recharge/cap changes or paid provider tests are authorized by implementation.

Passed: 42 Node regressions, 17 mocked OAuth Deno tests, isolated shared DB/
publishing/OAuth assertions and multi-connection races, and Pages static build.
Final publishing Deno run passed 31 mocks (16 provider, 15 orchestration);
the combined UI run passed 24 tests. Independent focused final security
review reported no blocking findings. Updated synthetic QA used exact
1440×1000 and 390×844 same-origin iframe viewports: no overflow, centered
dialog, synthetic target username and disabled media-scope confirmation.
Native outer-window resize still does not set the measured viewport.

Hydrated production-component tests used preview-only mock Supabase:
composer disabled while preview is pending, cancel/edit/reconfirm works,
and local File digest/freezing reaches confirmation. Exact expected digest
was not extracted from React state. No final publishing, Storage save/upload
or OAuth was clicked; mock final actions reject and external traffic is denied.
These checks do not establish real provider acceptance or persistence.
Evidence: workspace `../reports/qa/x-manual-publication/follow-up.txt`.
Targeted backend migration is in progress with its deployment owner; its
result is pending, so do not claim the migration or Functions are applied.

Next: final checks/reviews, manual notes and `knowledge:update`, normal PR/CI
and exact-head squash, then scoped rollout of
`20261004110000_social_x_publications.sql`, `social-x-publish` and the two
media-scope-compatible OAuth Functions. Do not reapply old OAuth migrations,
db push/reset, modify shared Auth/unrelated apps/Cloud Run, or regenerate
knowledge concurrently with unfinished source changes. Sync the authorized
tracked-source mirror with conflict checks and secret/build exclusions.
Root must replace this pending state with actual rollout results at closure.

## 2026-10-04 19:01 JST live X authorization and persisted connection verified

This remains the evidence for the original X grant and overrides the earlier
16:05 hold below. Its publishing-unimplemented statements are historical;
the 20:37 current publishing section above takes precedence.
At 18:59 JST the user approved using free API credits for connection. One live
OAuth grant completed at 19:01 JST. The browser worker verified the user-owned
identity on the grant screen and the expected read/write/offline scopes without
DM or email. The app confirmed:
`Xの連携許可が完了しました。投稿・自動公開機能はまだ有効になりません。`
After reload, X still showed `登録済み`, `Xに再連携`, and server-managed saved
tokens with values hidden. This verifies post-authorization persistence, not
merely saved client configuration. The app UI does not display a connected
handle; identity was checked on the grant screen. Only callback-required
identity lookup occurred, with no extra/manual API call or token refresh.

After connection, automatic recharge remained OFF and the finite usage cap
persisted. No credit purchase or post was performed. Spend displays can lag or
round, so unchanged display does not establish exact API cost or guaranteed
zero charge. Private billing amounts and payment data do not belong in public
Git or knowledge notes. Free-credit authorization is not permission to buy
credits, enable recharge, or add unrelated API usage.

The user later requested scheduled X publishing; its current local implementation
status is documented above. DM, comments, analytics, and webhooks remain
unimplemented. Live token refresh, expiry, cancellation, and reauthorization
were not exercised. Do not repeat authorization or send test posts merely for
verification.
The backend is already deployed: do not reapply migration/Functions or modify
shared DB/Auth, Cloud Run, or unrelated secrets. This closure changes only
three repository documents and two manual Obsidian notes, with no structural
source change and no Graphify regeneration.

## 2026-10-04 16:05 JST historical deployment/configuration record, authorization then held

Local branch: `feat/x-oauth-pkce`, based on `02117d430a168eb7ab2546e9dcb8af1c22d2ff71`.
OAuth 2.0 S256 PKCE support is implemented in the X integration UI and SNS-only
Edge Functions. See `docs/X_OAUTH.md` for the contract, security boundaries,
fixed callback, and deployment prerequisites. Final verification passed: 30 Node
regressions, 16 mocked Deno tests, three Edge Function type checks, TypeScript,
lint, isolated shared DB/OAuth assertions, and real multi-connection race tests.
Static GitHub Pages build and synthetic desktop/mobile layout verification passed.
The layout check used exact-width iframes because native browser resizing did not
change the reported viewport. SSR effects were not exercised. Production
configuration submission and reload were subsequently verified at 16:05 JST;
production OAuth authorization, callback, and provider exchange remain untested.
No live provider call was made.

As of 2026-10-04 15:54 JST, the exact additive migration
`20261004070000_social_x_oauth.sql`, `social-x-oauth`,
`social-x-oauth-callback`, and the updated `social-integration-secrets` are
deployed to `ycsqfajidusuibqljjwr`. All six non-SNS public/auth schema fingerprints
(columns, constraints, policies, grants, functions, RLS) match before and after.
PR #8's final head `0cdefc22af5b46073d67a4d136b756cd37921c38` passed CI and was
squash-merged at 16:02 JST as `6f07ef8dc14703557285b9380fc924d16c6197fc`.
GitHub Pages run https://github.com/MARUGO-s/sns_management/actions/runs/37184605009
completed successfully for that merge SHA. At 16:05 JST, the live authenticated
app saved Client ID and secret via protected Vault fill. Reload showed an empty
secret field with `保存済み（変更時のみ入力）`, the correct fixed callback, scopes
`tweet.read tweet.write users.read offline.access`, and no manual X token fields.
Current status is `設定保存済み・未接続（要確認）`, not connected.
X developer registration and provider OAuth configuration are complete:
read/write without DM/email, confidential web client, fixed callback
and production website URL. Newly generated client credentials were transferred
directly into Energy Vault, then securely filled in the app, not files, chat, or
logs. Do not claim a connected account until the owner's OAuth grant and verified
token persistence are completed. Actual publishing/scheduling remains outside
this change. Do not send a test post.

The user authorized access to this app's Dropbox knowledge folder and source
mirror only. This does not grant access to the Dropbox secrets folder, backups,
or unrelated protected data. The user approved X developer enrollment without
payment. The registration worker confirmed its approved submission and dashboard
redirect. The console displayed a default developer app under a Pay Per Use
project. No app creation, payment, credits purchase, or automatic top-up was
performed by a worker. Provider API calls remain blocked until any possible
charges are clarified and authorized.
The live console showed balance/free credits/current spend all $0 and no card.
Its $20 free-credit offer requires first card registration. The final cost and
credit requirements for the identity endpoint are not verified; neither zero
balance nor an offer establishes free API use. Do not start OAuth, grant access,
invoke the callback, exchange tokens, call X APIs, register a card, purchase
credits, enable auto-top-up, or post under the current no-charge instruction.
See the source links in `docs/X_OAUTH.md`.

Migration `20261004070000_social_x_oauth.sql` is additive and applied. It adds
SNS-only configs/state, transaction-scoped membership guards, configuration/token
revision binding, refresh CAS/receipt persistence, and atomic legacy secrets
mutation. The exact migration, two X Edge Functions, and updated
`social-integration-secrets` are deployed; do not repeat deployment blindly,
and never db push/reset the shared project.
Unrelated Functions are unchanged. Production secret-table RLS, table access and
function execute permissions deny `anon`/`authenticated`; unauthenticated requests
to JWT-required Functions returned 401.
Unchanged configuration saves preserve a working connection. Expired tokens
report `needsRefresh`, stale configuration reports `needsReview`. Refresh retries
identical persistence without repeating provider exchange; process/provider/DB
failures may still require reauthorization.

GitHub browser/CLI sign-in as MARUGO-s and repository administration were
verified. Supabase hCaptcha is resolved: the browser worker verified owner access
to the line_management organization's gourmet project, main PRODUCTION branch;
CLI authentication and exact linking to `ycsqfajidusuibqljjwr` were also verified.
The backend deployment above was separately verified by the deployment owner;
access verification alone is not proof of rollout.

Knowledge closure completed at 2026-10-04 15:47 JST. The authorized manual
Obsidian design note `20_設計/X OAuth接続.md` and its architecture link now record
the decisions, verification, rollout state, shared-project boundaries, and
no-charge restriction. `npm run knowledge:update` regenerated code-only
Graphify, public maps, runtime views, `docs/AI_CONTEXT.md`, and Obsidian outputs:
494 nodes, 638 edges, 46 communities; consistency and vault secret-marker checks
passed. `.npmrc` was automatically excluded as potentially sensitive. No LLM
extraction tokens were used. Implementation commit
`4fb332d50391863bcc217069ac2fb0a1d8eb6e1f` is on `feat/x-oauth-pkce`;
PR #8 https://github.com/MARUGO-s/sns_management/pull/8 is now merged and Pages
published as recorded above. The earlier 102-file implementation tree was
synchronized with 35 updates, 67 matches, zero conflicts/deletions.
Final rollout documentation uses `docs/x-oauth-rollout-complete`, a docs-only
branch from merge SHA `6f07ef8`. Submit it through normal PR/CI, never direct main
push. Manual Obsidian X/architecture notes were updated with zero concurrency
conflicts. Knowledge checks, the two knowledge-model Node regressions and diff
whitespace checks passed. The authorized source mirror matched all 102 tracked
files at closure commit `cb2fc93`: three document updates, 99 matches, zero
conflicts/deletions, exact progress-file agreement. Final log additions are
resynchronized using the same baseline/concurrency guards while preserving
unrelated edits and excluding secrets, dependencies, builds and index outputs.
No code or knowledge regeneration is needed for documentation-only
changes. The unresolved user choice is hold the configured connection or inspect
free-credit conditions; neither choice authorizes card registration. No test post.

## 2026-10-04 migration override

Authoritative repository: `MARUGO-s/sns_management`; production: `https://marugo-s.github.io/sns_management/`.
Database: shared gourmet project `ycsqfajidusuibqljjwr`, not the old SNS or deleted SMS project.
SNS tables/functions/storage are namespaced. Do not db push/reset the shared project.
The bootstrap retains the prior SNS SQL with shared-project safeguards.
The additive X OAuth migration `20261004070000_social_x_oauth.sql` is now also applied.
Existing gourmet schema/policies/functions were compared and are unchanged.
SNS enrollment is explicit; browser sessions and logout are app-local, but Auth identities/keys/capacity are shared.
Cloud Run for this target is not connected because the Google credential expired. Configure an SNS-only job
and SOCIAL_GOOGLE_* secrets after reauthentication; never overwrite the old job or gourmet secrets.
Initial SNS administrator requires the owner's explicit account selection.
The exact SNS root URL is added to Auth redirects; gourmet Site URL and its three redirects are unchanged.
Google OAuth is disabled on gourmet; the Google button requires an explicit build flag after provider setup.
Prior sections below are historical and must not override this migration record.

## 2026-10-04 operator UI redesign

The operator and sign-in screens use a light violet/white workspace design in
`app/social-design.css`, imported after `globals.css` and scoped to `.social-app`
and `.social-auth`. The composer follows channel -> content/files -> schedule,
with a local image/video and text preview. No publishing implementation was added.
Status cards open the relevant post list; total schedule counts are independent
of search. `app/lib/post-list.ts` combines query/status filtering without mutating
the source list and sorts scheduled posts chronologically. The mobile menu closes
on navigation or Escape. In-app navigation preserves the unsaved composer state;
reloading does not persist it. See `docs/SOCIAL_UI.md` for the current workflow.
UI verification uses synthetic data and an isolated harness outside this repo,
with no production Auth session or database write. Never deploy that harness or
introduce an authentication bypass into the production routes.

## Project

Instatic TalksX is a Japanese social operations console for Instagram, TikTok, X, and Threads.
The local app runs at `http://localhost:3000/` from the repository root.
The GitHub Pages production deployment is:

`https://marugo-s.github.io/sms-management/`

The legacy OpenAI Sites deployment remains available as a secondary preview only:

`https://instatic-talksx.yoshito0428.chatgpt.site`

## Current state

The 2026-10-04 current rollout sections above supersede the older infrastructure
details below. X manual publishing code/UI is now deployed; media permission
and real provider validation remain separate, and scheduling is not implemented.

- React/Vinext app in `app/social-console.tsx`, `app/admin/admin-console.tsx`, route files, and `app/globals.css`.
- HeroUI v3 is installed and applied to key action buttons.
- Supabase project is linked with ref `xpdrewhzisycjdtcvvey`.
- Supabase schema is deployed through `supabase/migrations/`.
- Supabase tables: `social_stores`, `social_workspaces`, `social_workspace_members`, `social_posts`, `social_post_channels`, `social_post_files`, `social_media_jobs`, `social_integrations`, `social_integration_secrets`, `social_admin_users`, `social_user_profiles`, `social_audit_logs`.
- Private Supabase Storage bucket: `post-files`, currently limited to 50 MB per object for Free-plan operation.
- RLS policies are enabled for authenticated users. Workspace membership checks run through non-exposed `private` schema functions to prevent policy recursion.
- Supabase Auth email/password and Google OAuth sign-in protect all app data.
- `social_stores` is the canonical 23-store master: 22 stores from the MARUGO GROUP brands page plus `BLU NERO`.
- New email/password registrations require a store. The selected store is sent as `social_store_id` user metadata, validated against `social_stores`, and copied into the canonical profile/workspace columns by database and app logic.
- Google OAuth signup keeps the selected store only as a temporary browser handoff until the callback completes. Existing users whose profile has no store see a one-time required store selection before the operations console loads.
- Never use `user_metadata` for authorization. Canonical store scope comes from `social_user_profiles.store_id` and `social_workspaces.store_id`; RLS remains user/workspace based.
- Posts, history, channels, and file metadata are stored in Postgres. File bytes are stored in private Storage.
- History videos can be streamed inside the app. The browser requests a
  temporary signed Storage URL only when the user opens a video; original and
  processed videos remain private, and the separate download action remains
  available.
- Video editing supports 1:1, 4:5, 9:16, and 16:9 crop settings, start/end trimming, and multiple intermediate cut ranges. Overlapping cuts are normalized, preview playback skips cut ranges, the source is preserved, and the edited MP4 is added as a separate `social_post_files` row.
- The `media-jobs` Edge Function dispatches Cloud Run Jobs. Without Google Cloud secrets it safely returns `configured: false` and leaves the job queued. Users can retry queued or failed jobs from history.
- The FFmpeg worker is in `workers/media-processor/`. Its deployment and secret setup are documented in `workers/media-processor/README.md`.
- SNS secrets are written only through the authenticated `integration-secrets` Edge Function. Browser clients never read stored secret values.
- `/admin` is an administrator-only console for all users, stores, workspaces, posts, scheduled posts, files, integration status, and audit history. It provides both all-store and per-store views, a store operations summary, chronological reservation schedule, post status updates, short-lived file download URLs, and administrator grant/revoke controls.
- Administrator access is stored by Auth user ID in `social_admin_users`. Never hardcode administrator emails or IDs in frontend source or migrations.
- Administrator changes require an existing registered user, are limited by RLS to current administrators, and are written to the audit log. The UI prevents self-revocation and the database prevents removal of the final administrator.
- `social_audit_logs` records safe operation metadata only. It deliberately excludes post bodies and all rows from `social_integration_secrets`.
- The Sites deployment project is recorded in `.openai/hosting.json`. Production variables are managed in Sites, not committed files.
- GitHub Pages is deployed by `.github/workflows/deploy-github-pages.yml`. It builds a static artifact with `npm run build:github-pages`; the workflow reads only the two public Supabase client settings from GitHub Actions Secrets.
- Dropbox backup script: `scripts/backup-supabase-to-dropbox.mjs`.

## Important commands

```bash
npm install
npm run dev
npm test
npm run backup:dropbox
supabase db push --linked
supabase functions deploy integration-secrets --use-api
supabase functions deploy media-jobs --use-api
supabase db advisors --linked --type all --level warn --fail-on none
```

## Environment and security

- `.env.local` is intentionally excluded from Git and the Dropbox source mirror.
- The Dropbox-only runtime handoff is `/Users/yoshito/Library/CloudStorage/Dropbox/web/instatic-talksx-secrets/.env.local`.
- Keep future server keys in the same Dropbox-only folder, never inside the Git source mirror.
- Client variables: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- The Dropbox backup requires server-only `SUPABASE_SECRET_KEY` and `DROPBOX_BACKUP_DIR`.
- Secrets may be stored in the dedicated Dropbox secrets folder for AI handoff, as approved by the owner.
- Never put `SUPABASE_SECRET_KEY`, `service_role`, SNS Client Secrets, or SNS access tokens in Git, the source mirror, browser storage, chat messages, screenshots, or this handoff file.

## Product boundary

The current production app safely stores users, reservations, history, files, and SNS credentials. Actual publishing, inbox sync, webhooks, and platform analytics still require approved developer apps and provider-specific OAuth/publishing implementations for Instagram, TikTok, X, and Threads. The UI deliberately labels those areas as pending instead of showing mock production data.

## Supabase Auth settings

Email confirmation and Google OAuth are enabled. Supabase Dashboard > Authentication > URL Configuration must allow both deployments:

- Site URL: `https://marugo-s.github.io/sms-management/`
- Redirect URLs must be separate entries, never concatenated into one string:
  `http://localhost:3000/**`, `http://127.0.0.1:3000/**`,
  `https://marugo-s.github.io/sms-management/**`,
  and `https://instatic-talksx.yoshito0428.chatgpt.site/**`
- Site URL must be `https://marugo-s.github.io/sms-management/` with no `**`

Before testing email confirmation, password reset, or Google OAuth on GitHub Pages, verify that the GitHub Pages wildcard redirect entry above has actually been added in the Supabase dashboard. It cannot be stored in source code or GitHub Actions.

Google OAuth credentials remain stored in Supabase and Google Auth Platform because the current secret cannot be exported from the local project. Never add the Google Client Secret to Git, the source mirror, chat messages, screenshots, or this handoff file.

Google OAuth was verified by confirming that the Supabase authorize endpoint redirects to `accounts.google.com`.

Supabase Advisors currently reports one Auth warning: leaked-password protection is disabled. Supabase requires a Pro plan for this option; keep the app's 12-character signup minimum while the project remains on Free.

## Dropbox backup

Supabase is the production source of truth. Dropbox is the approved local backup and secret handoff destination. The backup script writes table JSON and files under:

`/Users/yoshito/Library/CloudStorage/Dropbox/web/instatic-talksx-backups/`

The app cannot write to a Mac filesystem directly when deployed to the cloud. Run the backup script on the Mac, or add a separate scheduled runner.

Backups include `social_integration_secrets` and must therefore be treated as sensitive. Keep them within the owner's Dropbox account and do not attach them to GitHub issues, chats, or screenshots.

## GitHub

Repository: `https://github.com/MARUGO-s/sms-management`
Branch: `main`

Before changing the database, create a migration with `supabase migration new <name>`, apply it with `supabase db push --linked`, verify it with `supabase db query --linked`, and run Supabase Advisors.

The migration `20260726111630_fix_social_rls_recursion.sql` fixes the login-time workspace load failure caused by circular RLS policy references. Its authenticated create/read verification must remain rollback-only so no test workspace is left in production.

The migration `20260726114941_allow_workspace_owner_returning.sql` allows a newly created workspace owner to read the row returned by the same insert statement.

The migrations `20260726121622_add_social_admin_console.sql` and `20260726122528_consolidate_social_admin_rls.sql` add the administrator directory, user profile sync, safe audit logging, and consolidated administrator-aware RLS. The initial administrator was provisioned directly in production after migration; it is not stored in Git.

The migration `20260726124138_manage_social_administrators.sql` lets administrators manage administrator access from the `/admin` user directory while preserving the final administrator and auditing grant/revoke actions.

The migration `20260726130739_add_social_store_affiliation.sql` creates the 23-store master, adds canonical `store_id` columns to profiles and workspaces, validates signup metadata, allows a user to set an initially empty profile store exactly once, and exposes only active store names to anonymous signup pages.

The migrations `20260726135609_add_social_media_processing.sql` and `20260726141243_fix_media_job_rls_qualification.sql` add Free-plan media limits, original/processed file lineage, asynchronous crop jobs, strict same-workspace/source-file RLS, and service-role worker access.

The migration `20260727171106_add_media_timeline_editing.sql` validates optional
timeline fields stored in `crop_config`: non-negative start time, at least
0.5 seconds between start/end, up to 32 cut ranges, and cuts of at least
0.1 seconds. Old crop-only jobs remain valid.

The migration `20260727204751_harden_media_timeline_validation.sql` is an
idempotent validation hardening pass.

The migration `20260728040605_enforce_media_timeline_remaining_duration.sql`
adds the final server-side guard: after sorting and merging overlapping cut
ranges, at least 0.5 seconds must remain inside the selected start/end window.
All three timeline migrations are applied in production.

## 2026-07-28 Cloud Run status

Cloud Run media processing has now been configured. Do not repeat the setup blindly.

- Google Cloud project: `instatic-talksx-media`
- Region: `asia-northeast1`
- Artifact Registry repository: `instatic-talksx`
- Worker image is pinned by digest in the Cloud Run Job.
- Cloud Run Job: `instatic-media-processor`
- Job resources: 1 task, parallelism 1, max retries 1, 15 minute timeout, 2 vCPU, 2GiB memory
- Runtime service account: `instatic-media-runtime`
- Dispatcher service account: `instatic-media-dispatcher`, granted `roles/run.jobsExecutorWithOverrides`
- Google Secret Manager secret names: `instatic-supabase-url`, `instatic-supabase-secret-key`
- Supabase Edge Function secret names: `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_CLOUD_REGION`, `GOOGLE_CLOUD_RUN_JOB_NAME`

The original stuck job was repaired and completed on July 28, 2026 JST. The
source is actually 3 minutes 55 seconds, not 9 minutes 16 seconds as an older
handoff incorrectly stated. The processed MP4 was verified as H.264/AAC,
1080x1920, 235.01 seconds, and 44,992,238 bytes. The original remains stored
and exactly one processed file row exists.

The incident had three parts: the Secret Manager value used as
`SUPABASE_SECRET_KEY` was invalid; the fixed 2.6 Mbps output exceeded the
Storage 50 MB limit; and the dispatcher marked the request `processing` before
the worker started. The worker now calculates a duration-aware bitrate, uses
compact 720-based dimensions for long videos when needed, and rejects videos
that cannot fit at a safe minimum quality. Jobs use
`queued -> dispatching -> processing`, stale active jobs can be recovered after
20 minutes, and worker output writes are idempotent.

Timeline editing is deployed to the same Cloud Run Job. The worker image is
pinned to digest
`sha256:74ae97bc5705d8704c695b147edcc79053517c8c2607ca257a66f5dc97b0945b`
and was smoke-tested against the existing completed crop-only job for backward
compatibility. Docker verification creates real audio and
video-only inputs, applies start/end trim plus a middle cut, and confirms
3.0-second and 1.5-second outputs respectively.

Production E2E verification reused the existing source without modifying it:
start 1s, end 5s, and cut 2s-3s produced a 3.003-second H.264/AAC 1080x1920
MP4. The temporary Storage object, media job, file row, and audit rows were
removed afterward; the original and existing completed job remain.

The service-account JSON was used to create the Supabase Edge Function secret and then removed from Cloud Shell. The local downloaded copy should be removed from the Mac Downloads folder. Never place the JSON, Supabase secret key, Google key, SNS secrets, or any secret values in Git, this file, `PROJECT_PROGRESS.md`, Dropbox source mirror, chat, or screenshots.

## Reservation cancellation

The reservation view now has a `キャンセル` button for each scheduled post. The action confirms with the user, updates only a still-`scheduled` row to `status=draft` and `scheduled_at=null`, and keeps the post body and attachments. The post disappears from the reservation queue and remains available in History as a draft. No migration or Edge Function change was needed; existing workspace RLS controls the update. `npm test` passed after this change. The change is deployed to Sites production version 10 at `https://instatic-talksx.yoshito0428.chatgpt.site`. One real UI verification remains: while authenticated, cancel one scheduled post and confirm it disappears from the queue and appears as a draft in History. Unauthenticated HTTP checks return `401` because the site is owner-only.

## GitHub Pages entrypoint

GitHub Pages is the primary production deployment at `https://marugo-s.github.io/sms-management/`. The repository uses GitHub Actions rather than legacy branch publishing. `.github/workflows/deploy-github-pages.yml` builds `dist/client` with `npm run build:github-pages` and uploads it as the Pages artifact. The static build keeps all user data, authentication, files, and media requests in Supabase/Cloud Run; it never contains a secret key.

Because a project Pages site is served beneath `/sms-management/`, `scripts/prepare-github-pages.mjs` rewrites generated asset and metadata paths after Vinext's static export. `app/lib/public-path.ts` handles in-app links and Supabase redirect targets. Do not remove either file unless the Pages hosting path changes. Keep `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only as GitHub Actions Secrets; do not add any Supabase secret/service key or SNS secret to this workflow.

Supabase Dashboard > Authentication > URL Configuration must include `https://marugo-s.github.io/sms-management/**` in Redirect URLs before Google OAuth, email confirmation, or password reset can return to the GitHub Pages application.

## Graphify system map

## 2026-08-29 login notice

The login screen displays a security notice explaining that the previous password was cleared and directing users to `パスワードを再設定`. It is shown only in sign-in mode. The change is in `app/social-console.tsx` and `app/globals.css`; no database or Auth configuration changed. `npm test` and `npm run build:github-pages` passed. Verify the notice after the GitHub Pages deployment completes.

The administrator console includes a `システムマップ` view with two generated surfaces: `public/system-map/graph.html` for the Graphify code graph and `public/system-map/environment.html` for the runtime plus AI/Graphify/Obsidian knowledge loop. The current graph statistics are generated into `public/system-map/graph-stats.json`; do not hardcode counts in the UI.

After intentional code structure changes, run `npm run knowledge:update`. It refreshes Graphify, the admin map, the environment diagram, the Obsidian Graphify export, AI entry notes, and consistency checks. Use `npm run knowledge:check` before closure. `graphify-out/` is deliberately ignored by Git and must not be added to the Dropbox source mirror. Keep this code-only boundary; do not add environment files, runtime secrets, user uploads, post content, or database exports to Graphify input.

This integration was deployed as Sites v11 from source commit `827d5ddf03a7e6e4699dfd69cf949b813df012d0`. The Graphify static asset is suitable for architecture review only; it does not replace the existing Supabase RLS, Cloud Run processing, or admin authorization paths.

## Mandatory Graphify-first code investigation

This is an absolute operating rule for every AI and developer working on this repository.

- Before broad `grep` or repeated file reads, use the existing Graphify graph to identify the relevant nodes, files, and relationships.
- Search durable manual knowledge first with `npm run knowledge:search -- "<task or topic>"`; then use Graphify for the current code structure.
- Run Graphify from `/Users/yoshito/Documents/New project`.
- Use `graphify query "<question>"` for cross-code discovery, `graphify path "<A>" "<B>"` for a connection trace, and `graphify explain "<node>"` for callers and callees.
- After Graphify identifies the likely implementation, read only the required source ranges. Do not begin with blind repository-wide `grep`/`read` loops.
- Graphify is a structural map, not a substitute for source verification. Read the relevant files directly when editing code or checking exact behavior.
- SQL migrations, RLS policies, triggers, CSS, Docker/config files, and runtime links across Supabase, HTTP, Edge Functions, and Cloud Run may not appear as connected Graphify nodes. Inspect those specific files directly when they are part of the task.
- After intentional code-structure changes, run `npm run knowledge:update` before review and deployment. Do not investigate or report from a stale graph.
- If `graphify update .` fails with a sandbox watcher permission error, use `npm run graphify:system-map`, which performs the safe code-only extract and clustering flow.
- Keep Graphify code-only. Never add environment files, secrets, user posts, uploaded files, production database exports, or SNS credentials to its input.

## Obsidian knowledge vault

Durable project knowledge is kept in an Obsidian vault stored in Dropbox and synced across desktop PCs. It is external memory: read the relevant notes to reconstruct context, and write findings back after work.

- Vault root: `/Users/yoshito/Library/CloudStorage/Dropbox/web/アプリ知識`
- Per-app layout: `10_アプリ別/<app>/` (this app: `10_アプリ別/Instatic TalksX/`), with `00_HOME.md` and numbered folders for overview, design, operations, decisions, incidents, and feature knowledge.
- `70_AI作業環境/00_AI_START_HERE.md` is the AI entry point. It includes runtime and knowledge-loop diagrams, source priority, a work checklist, and a Graphify-to-manual-knowledge bridge.
- `90_Graphify/` inside each app folder is auto-generated Obsidian notes plus `graph.canvas`. Do not edit it by hand.
- Use `npm run knowledge:search -- "<topic>"` to search manual Obsidian notes without loading the entire vault into AI context.
- Update from the working directory with `npm run knowledge:update`; verify with `npm run knowledge:check`.
- Override the app folder with `KNOWLEDGE_VAULT_APP_DIR`, or only the Graphify output with `KNOWLEDGE_VAULT_GRAPHIFY_DIR`, if paths differ on another machine.
- Vault is code-and-docs knowledge only: never store `.env`, secret keys, service role keys, SNS tokens, production personal data, post bodies, or uploaded files in it.
- Dropbox syncs the vault between desktop PCs. Do not edit the same note on two machines at once; let sync finish first. Mobile sync via Dropbox is unreliable; use Obsidian Sync if mobile is needed.
- Docker Desktop can be used to build and test `workers/media-processor/` locally before Cloud Run deployment. Run `npm run worker:docker:check`; it builds `linux/amd64` by default and verifies Node, FFmpeg, libx264, non-root runtime, crop-plan tests, and a real 1080x1920 H.264/AAC MP4 encode/probe smoke test. Keep this isolated: do not stop, recreate, or modify unrelated running Supabase containers.

## Production site access

The production Sites project is now configured as `public` and was re-published as Sites v12 from source commit `93f90337cfafe1b48228117b426815ab9a70a3f4`. This removed the ChatGPT sign-in gate that appeared after the GitHub Pages redirect. An unauthenticated request to `https://instatic-talksx.yoshito0428.chatgpt.site` now returns the Instatic TalksX application (`HTTP 200`), whose data access remains protected by Supabase Auth and RLS. Do not re-enable owner-only Sites access unless the owner explicitly asks for a ChatGPT-gated internal preview.
