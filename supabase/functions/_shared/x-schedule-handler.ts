import {
  publishSavedXPost,
  type PublicationExpected,
  type PublicationStatus,
} from "./x-publish-handler.ts";

type ScheduleFile = PublicationExpected["files"][number];
type ScheduledClaim = {
  postId: string;
  workspaceId: string;
  userId: string;
  requestId: string;
  claimToken: string;
  integrationId: string;
  connectionRevision: string;
  accountId: string;
  scopes: string;
  expected: { body: string; files: ScheduleFile[] };
  claimCount: number;
};
type ScheduleState = "published" | "failed" | "unknown" | "waiting";
type Dependencies = {
  secret: string | null;
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  download: (file: ScheduleFile, workspaceId: string, postId: string) => Promise<Uint8Array>;
  fetcher?: typeof fetch;
  publish?: typeof publishSavedXPost;
  now?: () => number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const SCHEDULE_ERRORS = new Set([
  "invalid_request", "forbidden", "not_connected", "not_configured", "busy",
  "stale_snapshot", "unsupported_media", "publication_locked", "already_published",
  "media_expired", "storage_failed", "invalid_text", "media_too_large", "invalid_media",
  "media_failed", "provider_unavailable", "authorization_failed", "invalid_token",
  "rate_limited", "provider_rejected", "unknown_result", "invalid_state",
  "media_permission_required", "schedule_connection_changed", "schedule_attempt_limit",
  "schedule_not_ready", "schedule_cancelled", "schedule_media_checkpoint_incomplete",
]);
const PRE_SEND_RETRYABLE_ERRORS = new Set(["busy", "schedule_not_ready", "storage_failed"]);
// A stale publication snapshot is retryable only when the publisher's initial
// SQL gate proves that this exact request rolled back before any X work began.
// Never use this set for the worker's connection/status RPC failures.
const PROVEN_REQUEST_RETRYABLE_ERRORS = new Set(["stale_snapshot"]);

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

/** Avoid logging or reflecting the scheduler secret. */
function constantTimeSecretMatch(expected: string, authorization: string | null) {
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) return false;
  const actualBytes = new TextEncoder().encode(authorization.slice(prefix.length));
  const expectedBytes = new TextEncoder().encode(expected);
  if (actualBytes.length !== expectedBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index++) {
    difference |= actualBytes[index] ^ expectedBytes[index];
  }
  return difference === 0;
}

function parseClaim(value: unknown): ScheduledClaim | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const expected = row.expected;
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) return null;
  const data = expected as Record<string, unknown>;
  if (
    typeof row.postId !== "string" || !UUID.test(row.postId) ||
    typeof row.workspaceId !== "string" || !UUID.test(row.workspaceId) ||
    typeof row.userId !== "string" || !UUID.test(row.userId) ||
    typeof row.requestId !== "string" || !UUID.test(row.requestId) ||
    typeof row.claimToken !== "string" || !UUID.test(row.claimToken) ||
    typeof row.integrationId !== "string" || !UUID.test(row.integrationId) ||
    typeof row.connectionRevision !== "string" || !UUID.test(row.connectionRevision) ||
    typeof row.accountId !== "string" || !/^[0-9]{1,30}$/.test(row.accountId) ||
    typeof row.scopes !== "string" ||
    !["tweet.read tweet.write users.read offline.access",
      "tweet.read tweet.write users.read offline.access media.write"].includes(row.scopes) ||
    !Number.isInteger(row.claimCount) || (row.claimCount as number) < 1 || (row.claimCount as number) > 12 ||
    typeof data.body !== "string" || [...data.body].length > 10000 ||
    !Array.isArray(data.files) || data.files.length > 4 ||
    Object.keys(data).some((key) => !["body", "files"].includes(key))
  ) return null;
  const files: ScheduleFile[] = [];
  for (const file of data.files) {
    if (!file || typeof file !== "object" || Array.isArray(file)) return null;
    const item = file as Record<string, unknown>;
    if (
      Object.keys(item).some((key) =>
        !["id", "storagePath", "mimeType", "sizeBytes", "sha256"].includes(key)
      ) ||
      typeof item.id !== "string" || !UUID.test(item.id) ||
      typeof item.storagePath !== "string" || item.storagePath.length < 1 ||
      item.storagePath.length > 1024 ||
      typeof item.mimeType !== "string" ||
      !["image/jpeg", "image/png", "video/mp4"].includes(item.mimeType) ||
      !Number.isSafeInteger(item.sizeBytes) || (item.sizeBytes as number) < 1 ||
      (item.sizeBytes as number) > 20 * 1024 * 1024 ||
      typeof item.sha256 !== "string" || !SHA256.test(item.sha256)
    ) return null;
    files.push(item as unknown as ScheduleFile);
  }
  if (new Set(files.map((file) => file.id)).size !== files.length) return null;
  if (files.length && row.scopes !== "tweet.read tweet.write users.read offline.access media.write") return null;
  return {
    postId: row.postId,
    workspaceId: row.workspaceId,
    userId: row.userId,
    requestId: row.requestId,
    claimToken: row.claimToken,
    integrationId: row.integrationId,
    connectionRevision: row.connectionRevision,
    accountId: row.accountId,
    scopes: row.scopes,
    expected: { body: data.body, files },
    claimCount: row.claimCount as number,
  };
}

function safeCode(error: unknown) {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && SCHEDULE_ERRORS.has(code) ? code : "storage_failed";
}

async function finish(
  job: ScheduledClaim,
  deps: Dependencies,
  state: ScheduleState,
  errorCode: string | null = null,
  nextCheckAt: string | null = null,
) {
  return deps.rpc("social_x_schedule_finish", {
    p_post: job.postId,
    p_claim: job.claimToken,
    p_state: state,
    p_error: errorCode,
    p_next_check: nextCheckAt,
  });
}

function resultState(result: PublicationStatus, now: number): {
  state: ScheduleState;
  errorCode: string | null;
  nextCheckAt: string | null;
} {
  if (result.state === "published") return { state: "published", errorCode: null, nextCheckAt: null };
  if (result.state === "rejected") {
    return { state: "failed", errorCode: result.errorCode ?? "provider_rejected", nextCheckAt: null };
  }
  if (result.state === "preparing" && result.nextCheckAt) {
    const at = Date.parse(result.nextCheckAt);
    if (Number.isFinite(at) && at > now - 60_000 && at <= now + 24 * 60 * 60_000) {
      return { state: "waiting", errorCode: null, nextCheckAt: new Date(at).toISOString() };
    }
  }
  return { state: "unknown", errorCode: "unknown_result", nextCheckAt: null };
}

/** Processes at most one due, previously opted-in X reservation per cron tick. */
export async function handleXScheduledPublish(
  req: Request,
  deps: Dependencies,
): Promise<Response> {
  if (req.method !== "POST") {
    return json(405, { error: "invalid_request" });
  }
  if (!deps.secret || deps.secret.length < 32) {
    // Runtime remains disabled until an operator separately provisions a secret.
    return json(503, { error: "scheduler_disabled" });
  }
  if (!constantTimeSecretMatch(deps.secret, req.headers.get("authorization"))) {
    return json(401, { error: "forbidden" });
  }
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return json(400, { error: "invalid_request" });
  }
  try {
    const body = await req.text();
    if (body.length > 4096 || (body.trim() !== "" && body.trim() !== "{}")) {
      return json(400, { error: "invalid_request" });
    }
  } catch {
    return json(400, { error: "invalid_request" });
  }

  let claimed: unknown;
  try {
    claimed = await deps.rpc("social_x_schedule_claim_due", {});
  } catch {
    return json(503, { error: "storage_failed" });
  }
  if (claimed === null || claimed === undefined) {
    return json(200, { claimed: false });
  }
  const job = parseClaim(claimed);
  if (!job) {
    // The DB claim is already consumed. Never guess at a possibly malformed payload.
    return json(200, { claimed: true, state: "unknown" });
  }

  let connection: unknown;
  try {
    connection = await deps.rpc("social_x_schedule_connection", {
      p_post: job.postId,
      p_claim: job.claimToken,
    });
  } catch (error) {
    const code = safeCode(error);
    if (PRE_SEND_RETRYABLE_ERRORS.has(code)) {
      const retryAt = new Date((deps.now ?? Date.now)() + 60_000).toISOString();
      try {
        await finish(job, deps, "waiting", null, retryAt);
      } catch { /* The stale-claim sweep will release only a provably pre-send lease. */ }
      return json(200, { claimed: true, state: "waiting", error: code, retryAt });
    }
    try {
      await finish(job, deps, "failed", code);
    } catch { /* A later stale-claim sweep will make this terminally unknown. */ }
    return json(200, { claimed: true, state: "failed", error: code });
  }
  const fingerprint = (connection as { fingerprint?: unknown } | null)?.fingerprint;
  if (typeof fingerprint !== "string" || !SHA256.test(fingerprint)) {
    try {
      await finish(job, deps, "failed", "storage_failed");
    } catch { /* A later stale-claim sweep will make this terminally unknown. */ }
    return json(200, { claimed: true, state: "failed", error: "storage_failed" });
  }

  const expected: PublicationExpected = {
    ...job.expected,
    connectionFingerprint: fingerprint,
  };
  let result: PublicationStatus;
  try {
    result = await (deps.publish ?? publishSavedXPost)({
      postId: job.postId,
      userId: job.userId,
      requestId: job.requestId,
      fileIds: expected.files.map((file) => file.id),
      expected,
    }, {
      rpc: deps.rpc,
      download: (file) => deps.download(file, job.workspaceId, job.postId),
      fetcher: deps.fetcher,
    });
  } catch (error) {
    // Only the publisher's explicit, same-request proof establishes that its
    // initial SQL gate rolled back before any X work began. Missing or mismatched
    // proof remains ambiguous and must never be retried automatically.
    const proof = error as { notStarted?: unknown; requestId?: unknown };
    if (proof?.notStarted === true && proof.requestId === job.requestId) {
      const code = safeCode(error);
      if (code === "schedule_cancelled") {
        // Cancellation removed the queue payload and wrote a request tombstone.
        // Do not try to finish a claim that no longer exists.
        return json(200, { claimed: true, state: "cancelled", error: code });
      }
      if (
        PRE_SEND_RETRYABLE_ERRORS.has(code) ||
        PROVEN_REQUEST_RETRYABLE_ERRORS.has(code)
      ) {
        const retryAt = new Date((deps.now ?? Date.now)() + 60_000).toISOString();
        try {
          await finish(job, deps, "waiting", null, retryAt);
        } catch { /* Only the stale-claim sweep may release an uncertain lease. */ }
        return json(200, { claimed: true, state: "queued", error: code, retryAt });
      }
      try {
        await finish(job, deps, "failed", code);
      } catch { /* A later stale-claim sweep will make this terminally unknown. */ }
      return json(200, { claimed: true, state: "failed", error: code });
    }

    // A thrown transport error, absent proof, or request-ID mismatch does not
    // establish that X was never reached.
    try {
      await finish(job, deps, "unknown", "unknown_result");
    } catch { /* The claim expires to unknown; it is never reclaimed. */ }
    return json(200, { claimed: true, state: "unknown", error: "unknown_result" });
  }

  const outcome = resultState(result, (deps.now ?? Date.now)());
  try {
    await finish(job, deps, outcome.state, outcome.errorCode, outcome.nextCheckAt);
  } catch {
    // The provider receipt is read from the durable publication attempt on the
    // next sweep. A missing response is never permission to try another send.
    return json(503, { claimed: true, state: "unknown", error: "storage_failed" });
  }
  return json(200, {
    claimed: true,
    state: outcome.state === "waiting" ? "queued" : outcome.state,
    ...(outcome.errorCode ? { error: outcome.errorCode } : {}),
  });
}
