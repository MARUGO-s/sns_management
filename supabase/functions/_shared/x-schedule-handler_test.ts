import {
  handleXScheduledPublish,
} from "./x-schedule-handler.ts";

const secret = "schedule-secret-for-tests-only-0123456789";
const postId = "20000000-0000-4000-8000-000000000084";
const workspaceId = "10000000-0000-4000-8000-000000000080";
const userId = "00000000-0000-4000-8000-000000000002";
const requestId = "30000000-0000-4000-8000-000000000084";
const claimToken = "40000000-0000-4000-8000-000000000084";
const integrationId = "50000000-0000-4000-8000-000000000084";
const revision = "60000000-0000-4000-8000-000000000084";
const fingerprint = "a".repeat(64);

function request(body = "") {
  return new Request("https://worker.invalid", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    body: body || undefined,
  });
}

function claim(overrides: Record<string, unknown> = {}) {
  return {
    postId,
    workspaceId,
    userId,
    requestId,
    claimToken,
    integrationId,
    connectionRevision: revision,
    accountId: "123456789",
    scopes: "tweet.read tweet.write users.read offline.access",
    expected: { body: "scheduled text", files: [] },
    claimCount: 1,
    ...overrides,
  };
}

Deno.test("worker is disabled before it can claim without a provisioned secret", async () => {
  let calls = 0;
  const response = await handleXScheduledPublish(request(), {
    secret: null,
    rpc: async () => { calls++; return null; },
    download: async () => new Uint8Array(),
  });
  if (response.status !== 503 || calls !== 0) throw new Error("Disabled scheduler reached the database");
});

Deno.test("worker rejects an incorrect bearer without touching the queue", async () => {
  let calls = 0;
  const req = new Request("https://worker.invalid", {
    method: "POST",
    headers: { Authorization: "Bearer wrong" },
  });
  const response = await handleXScheduledPublish(req, {
    secret,
    rpc: async () => { calls++; return null; },
    download: async () => new Uint8Array(),
  });
  if (response.status !== 401 || calls !== 0) throw new Error("Bad scheduler credential was accepted");
});

Deno.test("only an empty cron payload is accepted", async () => {
  let calls = 0;
  const response = await handleXScheduledPublish(
    request(JSON.stringify({ postId })),
    {
      secret,
      rpc: async () => { calls++; return null; },
      download: async () => new Uint8Array(),
    },
  );
  if (response.status !== 400 || calls !== 0) throw new Error("Caller-selected post was accepted");
});

Deno.test("scheduled text uses the existing publisher and dispatches at most one X POST", async () => {
  const calls: string[] = [];
  let providerCreates = 0;
  const response = await handleXScheduledPublish(request(), {
    secret,
    now: () => Date.parse("2026-10-04T12:00:00Z"),
    rpc: async (name) => {
      calls.push(name);
      if (name === "social_x_schedule_claim_due") return claim();
      if (name === "social_x_schedule_connection") return { fingerprint };
      if (name === "social_x_publish_prepare") {
        return {
          attemptId: "70000000-0000-4000-8000-000000000084",
          postId,
          workspaceId,
          requestId,
          state: "preparing",
          claimed: true,
          body: "scheduled text",
          files: [],
          media: [],
        };
      }
      if (name === "social_x_publish_token") {
        return {
          accessToken: "synthetic-token",
          expiresAt: "2026-10-04T14:00:00Z",
          integrationId,
          workspaceId,
          needsRefresh: false,
        };
      }
      if (name === "social_x_publish_dispatch") {
        return { accessToken: "synthetic-token", body: "scheduled text", mediaIds: [] };
      }
      if (name === "social_x_publish_media" ||
        name === "social_x_publish_finish" || name === "social_x_schedule_finish") return true;
      throw new Error(`Unexpected RPC ${name}`);
    },
    download: async () => new Uint8Array(),
    fetcher: async (input) => {
      if (String(input) !== "https://api.x.com/2/tweets") throw new Error("Unexpected provider URL");
      providerCreates++;
      return new Response(JSON.stringify({ data: { id: "88888888", text: "scheduled text" } }), { status: 201 });
    },
  });
  const body = await response.json();
  if (response.status !== 200 || body.state !== "published" || providerCreates !== 1) {
    throw new Error(`Scheduled publication result mismatch: ${JSON.stringify({status: response.status, body, providerCreates, calls})}`);
  }
  if (
    calls.filter((name) => name === "social_x_schedule_claim_due").length !== 1 ||
    calls.filter((name) => name === "social_x_publish_dispatch").length !== 1 ||
    calls.at(-1) !== "social_x_schedule_finish"
  ) throw new Error("Worker claim/dispatch/finalization sequence was not single-pass");
});

Deno.test("lost X response becomes unknown and never causes an automatic second POST", async () => {
  const finishes: unknown[][] = [];
  let providerCreates = 0;
  const response = await handleXScheduledPublish(request(), {
    secret,
    rpc: async (name, args) => {
      if (name === "social_x_schedule_claim_due") return claim();
      if (name === "social_x_schedule_connection") return { fingerprint };
      if (name === "social_x_publish_prepare") {
        return {
          attemptId: "70000000-0000-4000-8000-000000000085",
          postId,
          workspaceId,
          requestId,
          state: "preparing",
          claimed: true,
          body: "scheduled text",
          files: [],
          media: [],
        };
      }
      if (name === "social_x_publish_token") {
        return {
          accessToken: "synthetic-token",
          expiresAt: "2026-10-04T14:00:00Z",
          integrationId,
          workspaceId,
          needsRefresh: false,
        };
      }
      if (name === "social_x_publish_dispatch") {
        return { accessToken: "synthetic-token", body: "scheduled text", mediaIds: [] };
      }
      if (name === "social_x_publish_media") return true;
      if (name === "social_x_publish_finish") return true;
      if (name === "social_x_schedule_finish") {
        finishes.push([args.p_state, args.p_error]);
        return true;
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    download: async () => new Uint8Array(),
    fetcher: async () => {
      providerCreates++;
      throw new TypeError("connection closed after request");
    },
  });
  const body = await response.json();
  if (response.status !== 200 || body.state !== "unknown" || providerCreates !== 1) {
    throw new Error(`Uncertain provider result mismatch: ${JSON.stringify({status: response.status, body, providerCreates})}`);
  }
  if (finishes.length !== 1 || finishes[0][0] !== "unknown" || finishes[0][1] !== "unknown_result") {
    throw new Error("Uncertain provider outcome was not durably stopped as unknown");
  }
});

Deno.test("media processing wait releases only the lease for same-request continuation", async () => {
  const now = Date.parse("2026-10-04T12:00:00Z");
  const finishArgs: Record<string, unknown>[] = [];
  let providerCalls = 0;
  const response = await handleXScheduledPublish(request(), {
    secret,
    now: () => now,
    rpc: async (name, args) => {
      if (name === "social_x_schedule_claim_due") {
        return claim({
          scopes: "tweet.read tweet.write users.read offline.access media.write",
          expected: {
            body: "scheduled text",
            files: [{
              id: "50000000-0000-4000-8000-000000000080",
              storagePath: `${workspaceId}/${postId}/synthetic.png`,
              mimeType: "image/png",
              sizeBytes: 10,
              sha256: "b".repeat(64),
            }],
          },
        });
      }
      if (name === "social_x_schedule_connection") return { fingerprint };
      if (name === "social_x_schedule_finish") {
        finishArgs.push(args);
        return true;
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    download: async () => new Uint8Array(),
    publish: async () => ({
      state: "preparing",
      attemptId: "70000000-0000-4000-8000-000000000086",
      requestId,
      nextCheckAt: new Date(now + 30_000).toISOString(),
    }),
    fetcher: async () => { providerCalls++; throw new Error("No provider call expected"); },
  });
  const body = await response.json();
  if (response.status !== 200 || body.state !== "queued" || providerCalls !== 0) {
    throw new Error("Media wait was not safely deferred");
  }
  if (
    finishArgs.length !== 1 || finishArgs[0].p_state !== "waiting" ||
    finishArgs[0].p_next_check !== new Date(now + 30_000).toISOString() ||
    finishArgs[0].p_claim !== claimToken
  ) throw new Error("Media wait did not preserve the same scheduled claim identity");
});

Deno.test("malformed claimed data is consumed but never reaches connection or provider", async () => {
  let laterCalls = 0;
  const response = await handleXScheduledPublish(request(), {
    secret,
    rpc: async (name) => {
      if (name === "social_x_schedule_claim_due") return claim({ accountId: "not-an-X-id" });
      laterCalls++;
      return { fingerprint };
    },
    download: async () => new Uint8Array(),
  });
  const body = await response.json();
  if (response.status !== 200 || body.state !== "unknown" || laterCalls !== 0) {
    throw new Error("Malformed private queue data reached publishing");
  }
});

Deno.test("a changed X connection fails closed before publication", async () => {
  const finishes: Record<string, unknown>[] = [];
  let publishCalls = 0;
  const response = await handleXScheduledPublish(request(), {
    secret,
    rpc: async (name, args) => {
      if (name === "social_x_schedule_claim_due") return claim();
      if (name === "social_x_schedule_connection") {
        throw Object.assign(new Error("schedule_connection_changed"), {
          code: "schedule_connection_changed",
        });
      }
      if (name === "social_x_schedule_finish") {
        finishes.push(args);
        return true;
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    publish: async () => {
      publishCalls++;
      throw new Error("Publisher must not run after connection binding changed");
    },
    download: async () => new Uint8Array(),
  });
  const body = await response.json();
  if (response.status !== 200 || body.state !== "failed" || publishCalls !== 0) {
    throw new Error("Changed connection reached the publishing handler");
  }
  if (
    finishes.length !== 1 || finishes[0].p_state !== "failed" ||
    finishes[0].p_error !== "schedule_connection_changed"
  ) throw new Error("Connection binding failure was not durably recorded");
});

async function runNotStartedFailure(error: unknown) {
  const finishes: Record<string, unknown>[] = [];
  const response = await handleXScheduledPublish(request(), {
    secret,
    now: () => Date.parse("2026-10-04T12:00:00Z"),
    rpc: async (name, args) => {
      if (name === "social_x_schedule_claim_due") return claim();
      if (name === "social_x_schedule_connection") return { fingerprint };
      if (name === "social_x_schedule_finish") {
        finishes.push(args);
        return true;
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    publish: async () => { throw error; },
    download: async () => new Uint8Array(),
  });
  return { response, finishes };
}

Deno.test("only same-request proven pre-send transient failures wait on the existing request", async () => {
  const now = Date.parse("2026-10-04T12:00:00Z");
  for (const code of ["busy", "schedule_not_ready", "storage_failed"]) {
    const { response, finishes } = await runNotStartedFailure(Object.assign(
      new Error(code),
      { code, notStarted: true, requestId },
    ));
    const body = await response.json();
    if (response.status !== 200 || body.state !== "queued" || body.error !== code) {
      throw new Error(`Proven ${code} did not return to the queue`);
    }
    if (
      finishes.length !== 1 || finishes[0].p_state !== "waiting" ||
      finishes[0].p_claim !== claimToken ||
      finishes[0].p_next_check !== new Date(now + 60_000).toISOString()
    ) throw new Error(`Proven ${code} did not preserve the claim/request retry contract`);
  }
});

Deno.test("proven same-request non-retryable pre-send failure is terminal", async () => {
  const { response, finishes } = await runNotStartedFailure(Object.assign(
    new Error("invalid_text"),
    { code: "invalid_text", notStarted: true, requestId },
  ));
  const body = await response.json();
  if (response.status !== 200 || body.state !== "failed" || body.error !== "invalid_text") {
    throw new Error("Proven non-retryable pre-send failure was not terminal");
  }
  if (
    finishes.length !== 1 || finishes[0].p_state !== "failed" ||
    finishes[0].p_error !== "invalid_text" || finishes[0].p_next_check !== null
  ) throw new Error("Failed pre-send receipt did not retain its safe error code");
});

Deno.test("proven same-request stale snapshot returns to the queue without changing request ID", async () => {
  const now = Date.parse("2026-10-04T12:00:00Z");
  const { response, finishes } = await runNotStartedFailure(Object.assign(
    new Error("stale_snapshot"),
    { code: "stale_snapshot", notStarted: true, requestId },
  ));
  const body = await response.json();
  if (
    response.status !== 200 || body.state !== "queued" ||
    body.error !== "stale_snapshot" ||
    body.retryAt !== new Date(now + 60_000).toISOString()
  ) throw new Error("Proven same-request stale snapshot did not return to the queue");
  if (
    finishes.length !== 1 || finishes[0].p_state !== "waiting" ||
    finishes[0].p_error !== null || finishes[0].p_claim !== claimToken ||
    finishes[0].p_next_check !== new Date(now + 60_000).toISOString()
  ) throw new Error("Stale snapshot retry did not preserve the original request and lease contract");
});

Deno.test("cancelled request tombstone stops without attempting claim finalization", async () => {
  const { response, finishes } = await runNotStartedFailure(Object.assign(
    new Error("schedule_cancelled"),
    { code: "schedule_cancelled", notStarted: true, requestId },
  ));
  const body = await response.json();
  if (response.status !== 200 || body.state !== "cancelled" || finishes.length !== 0) {
    throw new Error("Cancelled request attempted to finish or did not remain cancelled");
  }
});

Deno.test("missing or mismatched not-started proof remains unknown", async () => {
  for (const error of [
    Object.assign(new Error("busy"), { code: "busy", notStarted: true, requestId: "30000000-0000-4000-8000-000000000085" }),
    Object.assign(new Error("busy"), { code: "busy", requestId }),
    Object.assign(new Error("stale_snapshot"), { code: "stale_snapshot", notStarted: true, requestId: "30000000-0000-4000-8000-000000000085" }),
    Object.assign(new Error("stale_snapshot"), { code: "stale_snapshot", requestId }),
    new TypeError("connection closed"),
  ]) {
    const { response, finishes } = await runNotStartedFailure(error);
    const body = await response.json();
    if (response.status !== 200 || body.state !== "unknown" || body.error !== "unknown_result") {
      throw new Error("Unproven pre-send failure was not classified as unknown");
    }
    if (
      finishes.length !== 1 || finishes[0].p_state !== "unknown" ||
      finishes[0].p_error !== "unknown_result"
    ) throw new Error("Unproven outcome did not remain durably non-retryable");
  }
});
