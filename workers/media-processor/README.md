# Cloud Run Media Processor

2026-10-04 migration: the SNS target is shared gourmet, but this SNS-only Cloud Run job
is not connected yet. Reauthenticate Google Cloud first. Do not modify the old job or its
secrets. The examples below target a new SNS-specific job and secret names.

`media-processor` is a one-task Cloud Run Job that trims, cuts, and crops a
video with FFmpeg, creates a social-platform-sized MP4, uploads it to private Supabase
`social-social-post-files` bucket, and updates `social_media_jobs`.

The source video is never overwritten. The processed file is inserted as a new
`social_post_files` row with `media_variant = 'processed'`.

## Current operating boundary

- Supabase remains on the Free plan.
- Browser uploads are limited to 50 MB per file.
- A job runs only when the user explicitly saves a crop.
- Until Cloud Run is connected, requests remain `queued` in Supabase.
- The history screen can retry a queued or failed job.
- The worker targets one task at a time and a 15-minute timeout.
- The current worker supports video input and MP4 output.
- Optional `startTime`, `endTime`, and up to 32 intermediate cut ranges are
  normalized before FFmpeg runs. Overlapping cuts merge, out-of-window cuts are
  clipped, and at least 0.5 seconds must remain.
- The worker preserves audio when present and supports video-only sources.
- Output bitrate is calculated from source duration so the processed file stays
  below the 50 MB Storage limit. Short videos keep the normal output
  resolution; long videos use a compact 720-based output when required.
- Jobs move through `queued` -> `dispatching` -> `processing`. An active job
  with no update for 20 minutes can be safely dispatched again from History.

## Required Google Cloud resources

Choose the Google Cloud project before running any deployment command. Do not
reuse an unrelated project without the owner's approval.

Recommended names:

```text
Region: asia-northeast1
Artifact Registry: instatic-talksx
Cloud Run Job: instatic-media-processor-sns
Runtime service account: instatic-media-runtime
Dispatcher service account: instatic-media-dispatcher
```

Enable these APIs:

```bash
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com
```

Create the container repository and image:

```bash
gcloud artifacts repositories create instatic-talksx \
  --location asia-northeast1 \
  --repository-format docker

gcloud builds submit workers/media-processor \
  --tag asia-northeast1-docker.pkg.dev/PROJECT_ID/instatic-talksx/media-processor:COMMIT_SHA
```

## Runtime secrets

Store these values in Google Secret Manager. Never add them to this directory,
Git, a screenshot, or a shell script.

```text
instatic-sns-supabase-url       -> Supabase project URL
instatic-sns-supabase-secret-key -> Supabase server-only secret key
```

The Cloud Run runtime service account needs
`roles/secretmanager.secretAccessor` for those two secrets.

Create or update the job after the secrets exist:

```bash
gcloud run jobs deploy instatic-media-processor-sns \
  --image asia-northeast1-docker.pkg.dev/PROJECT_ID/instatic-talksx/media-processor:COMMIT_SHA \
  --region asia-northeast1 \
  --service-account instatic-media-runtime@PROJECT_ID.iam.gserviceaccount.com \
  --cpu 2 \
  --memory 2Gi \
  --tasks 1 \
  --parallelism 1 \
  --max-retries 1 \
  --task-timeout 15m \
  --set-env-vars MEDIA_BUCKET=social-social-post-files \
  --set-secrets SUPABASE_URL=instatic-sns-supabase-url:1,SUPABASE_SECRET_KEY=instatic-sns-supabase-secret-key:1
```

Pin secret versions instead of using `latest`.

## Supabase dispatcher secrets

The dispatcher service account needs the Google Cloud role
`roles/run.jobsExecutorWithOverrides` for the media job because the Edge
Function supplies `MEDIA_JOB_ID` at execution time.

Create a key for that dispatcher only after the Google Cloud project is chosen.
Store the compact JSON as a Supabase Edge Function secret, then remove the local
key file.

Required Supabase secrets:

```text
SOCIAL_GOOGLE_SERVICE_ACCOUNT_JSON
SOCIAL_GOOGLE_CLOUD_PROJECT_ID
SOCIAL_GOOGLE_CLOUD_REGION=asia-northeast1
SOCIAL_GOOGLE_CLOUD_RUN_JOB_NAME=instatic-media-processor-sns
```

Use the Supabase dashboard or `supabase secrets set --project-ref ...`. Never
place actual values in `.env.example`, `PROJECT_PROGRESS.md`, or Dropbox's Git
source mirror.

After setting the secrets, redeploy the dispatcher:

```bash
supabase functions deploy social-social-media-jobs \
  --use-api \
  --project-ref ycsqfajidusuibqljjwr
```

## Verification

1. Upload a video under 50 MB.
2. Open the crop editor and save a ratio.
3. Save the scheduled post.
4. Confirm the original file and a `queued` or `processing` job in history.
5. Wait for Cloud Run to complete.
6. Refresh history and download the new processed MP4.
7. Confirm the original file still exists.

Run the crop, encoding, and timeline calculation tests locally:

```bash
node --test \
  workers/media-processor/crop-plan.test.mjs \
  workers/media-processor/encoding-plan.test.mjs \
  workers/media-processor/timeline-plan.test.mjs
```
