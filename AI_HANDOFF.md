# Instatic TalksX Handoff

## 2026-10-04 X OAuth local implementation verified, rollout pending

Local branch: `feat/x-oauth-pkce`, based on `02117d430a168eb7ab2546e9dcb8af1c22d2ff71`.
OAuth 2.0 S256 PKCE support is implemented in the X integration UI and SNS-only
Edge Functions. See `docs/X_OAUTH.md` for the contract, security boundaries,
fixed callback, and deployment prerequisites. Final verification passed: 30 Node
regressions, 16 mocked Deno tests, three Edge Function type checks, TypeScript,
lint, isolated shared DB/OAuth assertions, and real multi-connection race tests.
Static GitHub Pages build and synthetic desktop/mobile layout verification passed.
The layout check used exact-width iframes because native browser resizing did not
change the reported viewport. SSR effects and authenticated submissions were not
exercised. No live provider call was made.

No migration, function, frontend, or app-side credential configuration has been
deployed by this work. X developer registration and provider OAuth configuration
are complete: read/write without DM/email, confidential web client, fixed callback
and production website URL. Newly generated client credentials were transferred
directly into Energy Vault, not files, chat, or logs. Do not claim a connected account until production rollout and the
owner's OAuth grant are verified. Actual publishing/scheduling remains outside
this change. Do not send a test post.

The user authorized access to this app's Dropbox knowledge folder and source
mirror only. This does not grant access to the Dropbox secrets folder, backups,
or unrelated protected data. The user approved X developer enrollment without
payment. The registration worker confirmed its approved submission and dashboard
redirect. The console displayed a default developer app under a Pay Per Use
project. No app creation, payment, credits purchase, or automatic top-up was
performed by a worker. Provider API calls remain blocked until any possible
charges are clarified and authorized.
The official pricing page lists User Read at $0.01/resource (checked 2026-10-04);
this does not prove the final `users/me` request is free. See the source links
in `docs/X_OAUTH.md`.

Migration `20261004070000_social_x_oauth.sql` is additive and unapplied. It adds
SNS-only configs/state, transaction-scoped membership guards, configuration/token
revision binding, refresh CAS/receipt persistence, and atomic legacy secrets
mutation. Deploy this exact migration and the two X Edge Functions plus the
updated `social-integration-secrets`; never db push/reset the shared project.
Unchanged configuration saves preserve a working connection. Expired tokens
report `needsRefresh`, stale configuration reports `needsReview`. Refresh retries
identical persistence without repeating provider exchange; process/provider/DB
failures may still require reauthorization.

GitHub browser/CLI sign-in as MARUGO-s and repository administration were
verified. Supabase hCaptcha is resolved: the browser worker verified owner access
to the line_management organization's gourmet project, main PRODUCTION branch;
CLI authentication and exact linking to `ycsqfajidusuibqljjwr` were also verified.
This access verification is not proof that the OAuth migration/functions are
deployed.

Knowledge closure completed at 2026-10-04 15:47 JST. The authorized manual
Obsidian design note `20_設計/X OAuth接続.md` and its architecture link now record
the decisions, verification, undeployed state, shared-project boundaries, and
no-charge restriction. `npm run knowledge:update` regenerated code-only
Graphify, public maps, runtime views, `docs/AI_CONTEXT.md`, and Obsidian outputs:
494 nodes, 638 edges, 46 communities; consistency and vault secret-marker checks
passed. `.npmrc` was automatically excluded as potentially sensitive. No LLM
extraction tokens were used. The feature branch is still uncommitted/unpushed at
this entry, and the source mirror has not been synchronized. Commit the generated
outputs first, then sync only Git-managed files with the established exclusions.

## 2026-10-04 migration override

Authoritative repository: `MARUGO-s/sns_management`; production: `https://marugo-s.github.io/sns_management/`.
Database: shared gourmet project `ycsqfajidusuibqljjwr`, not the old SNS or deleted SMS project.
SNS tables/functions/storage are namespaced. Do not db push/reset the shared project.
The bootstrap is the only current migration; it retains the prior SNS SQL with shared-project safeguards.
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
