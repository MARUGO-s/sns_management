import { type PublicationExpected, publicationErrorCode, publishSavedXPost, validatePublicationExpected } from "./x-publish-handler.ts";
import { normalizeScopes } from "./x-oauth.ts";
function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
const input = {
  postId: "00000000-0000-4000-8000-000000000101",
  userId: "00000000-0000-4000-8000-000000000102",
  requestId: "00000000-0000-4000-8000-000000000103",
  fileIds: [] as string[],
  expected: {
    body: "Synthetic test", files: [], connectionFingerprint: "a".repeat(64),
  } as PublicationExpected,
};
function fixture() {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const attempt = {
    attemptId: "00000000-0000-4000-8000-000000000104",
    workspaceId: "00000000-0000-4000-8000-000000000105",
    requestId: input.requestId,
    state: "preparing",
    claimed: true,
    body: "Synthetic test",
    files: [] as PublicationExpected["files"],
    media: [],
  };
  const token = {
    accessToken: "synthetic-access",
    needsRefresh: false,
    integrationId: "00000000-0000-4000-8000-000000000106",
    workspaceId: attempt.workspaceId,
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "social_x_publish_prepare") return attempt;
    if (name === "social_x_publish_token") return token;
    if (name === "social_x_publish_dispatch") {
      return { accessToken: token.accessToken, body: attempt.body, mediaIds: [] };
    }
    return true;
  };
  return { calls, attempt, token, rpc };
}
const noDownload = () => Promise.reject(new Error("Unexpected storage read"));
const noPause = () => Promise.resolve();
Deno.test("manual publication durably claims before a single write, returns no secrets", async () => {
  const f = fixture();
  let writes = 0;
  const result = await publishSavedXPost(input, {
    rpc: f.rpc, download: noDownload, pause: noPause,
    fetcher: async (url, options) => {
      assert(String(url) === "https://api.x.com/2/tweets");
      assert((options as RequestInit | undefined)?.method === "POST");
      assert(f.calls.at(-1)?.name === "social_x_publish_dispatch");
      writes++;
      return Response.json({ data: { id: "987654", text: "Synthetic test" } }, {
        status: 201,
      });
    },
  });
  assert(writes === 1 && result.state === "published");
  assert(result.remotePostId === "987654");
  assert(!JSON.stringify(result).includes("synthetic-access"));
  const finish = f.calls.at(-1);
  assert(finish?.name === "social_x_publish_finish");
  assert(finish.args.p_remote === "987654");
  assert(f.calls[0].args.p_expected === input.expected);
});
Deno.test("duplicate or unknown attempt returns status and invokes no provider", async () => {
  for (const state of ["preparing", "sending", "unknown", "published"]) {
    const f = fixture();
    f.attempt.claimed = false;
    f.attempt.state = state;
    let provider = 0;
    const result = await publishSavedXPost(input, {
      rpc: f.rpc, download: noDownload,
      fetcher: async () => { provider++; throw new Error("Unexpected"); },
    });
    assert(result.state === state && provider === 0 && f.calls.length === 1);
  }
});
Deno.test("only identical DB finalization retries after lost success receipt", async () => {
  const f = fixture();
  const receipts: string[] = [];
  let writes = 0;
  const result = await publishSavedXPost(input, {
    rpc: async (name, args) => {
      if (name === "social_x_publish_finish") {
        receipts.push(JSON.stringify(args));
        if (receipts.length < 3) throw new Error("Lost response");
        return true;
      }
      return await f.rpc(name, args);
    },
    download: noDownload, pause: noPause,
    fetcher: async () => {
      writes++;
      return Response.json({ data: { id: "987654", text: "Synthetic test" } }, {
        status: 201,
      });
    },
  });
  assert(result.state === "published" && writes === 1 && receipts.length === 3);
  assert(new Set(receipts).size === 1);
});
Deno.test("unpersisted known success is uncertainty, never a repeat write", async () => {
  const f = fixture();
  let writes = 0;
  const result = await publishSavedXPost(input, {
    rpc: async (name, args) => {
      if (name === "social_x_publish_finish") throw new Error("DB unavailable");
      return await f.rpc(name, args);
    },
    download: noDownload, pause: noPause,
    fetcher: async () => {
      writes++;
      return Response.json({ data: { id: "987654", text: "Synthetic test" } }, {
        status: 201,
      });
    },
  });
  assert(result.state === "unknown" && writes === 1);
});
Deno.test("lost dispatch response makes no provider call and preserves uncertainty", async () => {
  const f = fixture();
  let writes = 0;
  const result = await publishSavedXPost(input, {
    rpc: async (name, args) => {
      if (name === "social_x_publish_dispatch") throw new Error("Lost response");
      return await f.rpc(name, args);
    },
    download: noDownload, pause: noPause,
    fetcher: async () => { writes++; throw new Error("Unexpected"); },
  });
  assert(result.state === "unknown" && writes === 0);
  assert(f.calls.at(-1)?.args.p_state === "unknown");
});
Deno.test("401 and ambiguous response never trigger token refresh or write retry", async () => {
  for (const status of [401, 429, 503, 201]) {
    const f = fixture();
    let writes = 0;
    const result = await publishSavedXPost(input, {
      rpc: f.rpc, download: noDownload, pause: noPause,
      fetcher: async () => {
        writes++;
        return Response.json({ private_detail: "must-not-return" }, { status });
      },
    });
    assert(writes === 1);
    assert(result.state === (status < 500 && status !== 201 ? "rejected" : "unknown"));
    assert(!f.calls.some((c) => c.name.startsWith("social_x_oauth_refresh")));
    assert(!JSON.stringify(result).includes("must-not-return"));
  }
});
Deno.test("near-expiry credential rotates once and is re-read before dispatch", async () => {
  const f = fixture();
  let reads = 0, rotations = 0, writes = 0;
  const result = await publishSavedXPost(input, {
    rpc: async (name, args) => {
      if (name === "social_x_publish_token") {
        reads++;
        return { ...f.token, needsRefresh: reads === 1 };
      }
      if (name === "social_x_oauth_refresh_claim") {
        return {
          appId: "synthetic-client",
          clientSecret: "synthetic-secret",
          scopes: normalizeScopes(""),
          integrationId: f.token.integrationId,
          revision: "00000000-0000-4000-8000-000000000107",
          version: 1,
          refreshToken: "synthetic-refresh",
          accountId: "12345",
          accountUsername: "synthetic",
        };
      }
      return await f.rpc(name, args);
    },
    download: noDownload, pause: noPause,
    fetcher: async (url) => {
      if (String(url).endsWith("/oauth2/token")) {
        rotations++;
        return Response.json({
          access_token: "synthetic-rotated",
          refresh_token: "synthetic-next-refresh",
          token_type: "bearer", expires_in: 7200, scope: normalizeScopes(""),
        });
      }
      assert(String(url).endsWith("/tweets"), "No identity lookup allowed");
      writes++;
      return Response.json({ data: { id: "987654", text: "Synthetic test" } }, {
        status: 201,
      });
    },
  });
  assert(result.state === "published" && reads === 2 && rotations === 1 && writes === 1);
});
Deno.test("invalid saved body rejects preparation without provider request", async () => {
  const f = fixture();
  f.attempt.body = "あ".repeat(141);
  let writes = 0;
  const result = await publishSavedXPost(input, {
    rpc: f.rpc, download: noDownload, pause: noPause,
    fetcher: async () => { writes++; throw new Error("Unexpected"); },
  });
  assert(result.state === "rejected" && writes === 0);
  assert(!f.calls.some((c) => c.name === "social_x_publish_dispatch"));
});

Deno.test("expected envelope is bounded, ordered and whitelisted", () => {
  const id = "00000000-0000-4000-8000-000000000108";
  const file = { id, storagePath: "synthetic/original.png", mimeType: "image/png", sizeBytes: 8, sha256: "b".repeat(64) };
  const valid = { ...input.expected, files: [file] };
  assert(validatePublicationExpected(valid, [id]) === valid);
  for (const bad of [
    { ...valid, secret: "unexpected" }, { ...valid, files: [] },
    { ...valid, body: "a".repeat(10001) }, { ...valid, connectionFingerprint: "short" },
    { ...valid, files: [{ ...file, sha256: "BAD" }] },
    { ...valid, files: [{ ...file, sizeBytes: 0 }] },
    { ...valid, files: [{ ...file, token: "unexpected" }] },
  ]) {
    let rejected = false;
    try { validatePublicationExpected(bad, [id]); } catch { rejected = true; }
    assert(rejected, "invalid envelope accepted");
  }
});

Deno.test("changed original bytes reject before refresh, upload or provider requests", async () => {
  const f = fixture();
  const png = new Uint8Array(33);
  png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  f.attempt.files = [{
    id: "00000000-0000-4000-8000-000000000108", storagePath: "synthetic/original.png",
    mimeType: "image/png", sizeBytes: png.length, sha256: "b".repeat(64),
  }];
  f.token.needsRefresh = true;
  let provider = 0;
  const result = await publishSavedXPost({
    ...input, fileIds: [f.attempt.files[0].id], expected: { ...input.expected, files: f.attempt.files },
  }, {
    rpc: f.rpc, download: () => Promise.resolve(png), pause: noPause,
    fetcher: async () => { provider++; throw new Error("Unexpected"); },
  });
  assert(result.state === "rejected" && result.errorCode === "stale_snapshot" && provider === 0);
  assert(!f.calls.some((c) => c.name === "social_x_publish_token" || c.name === "social_x_publish_dispatch"));
});

Deno.test("definitive aborted dispatch gate safely rejects without provider call", async () => {
  const f = fixture();
  let provider = 0;
  const result = await publishSavedXPost(input, {
    rpc: async (name, args) => {
      if (name === "social_x_publish_dispatch") {
        throw Object.assign(new Error("stale_snapshot"), { code: "stale_snapshot", definitive: true });
      }
      return await f.rpc(name, args);
    }, download: noDownload, pause: noPause,
    fetcher: async () => { provider++; throw new Error("Unexpected"); },
  });
  assert(result.state === "rejected" && result.errorCode === "stale_snapshot" && provider === 0);
  assert(f.calls.at(-1)?.args.p_state === "rejected");
});

Deno.test("provider preparation codes map to SQL-safe public errors", () => {
  assert(publicationErrorCode({ code: "text_too_long" }) === "invalid_text");
  assert(publicationErrorCode({ code: "media_processing_failed" }) === "media_failed");
  assert(publicationErrorCode({ code: "invalid_provider_response" }) === "provider_unavailable");
});

Deno.test("only definitively aborted initial preparation proves not-started", async () => {
  for (const definitive of [true, false]) {
    let provider = 0;
    let caught: { notStarted?: boolean; requestId?: string } | undefined;
    try {
      await publishSavedXPost(input, {
        rpc: () => Promise.reject(Object.assign(new Error("stale_snapshot"), { code: "stale_snapshot", definitive })),
        download: noDownload,
        fetcher: async () => { provider++; throw new Error("Unexpected"); },
      });
    } catch (error) { caught = error as typeof caught; }
    assert(caught && provider === 0);
    assert((caught.notStarted === true) === definitive);
    assert(!definitive || caught.requestId === input.requestId);
  }
});

Deno.test("second original mismatch prevents uploading the first confirmed original", async () => {
  const f = fixture();
  const png = new Uint8Array(33);
  png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", png));
  const hash = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  f.attempt.files = ["108", "109"].map((suffix, index) => ({
    id: `00000000-0000-4000-8000-000000000${suffix}`, storagePath: `synthetic/${index}.png`,
    mimeType: "image/png", sizeBytes: png.length, sha256: index ? "b".repeat(64) : hash,
  }));
  let downloads = 0, provider = 0;
  const result = await publishSavedXPost({
    ...input, fileIds: f.attempt.files.map((file) => file.id), expected: { ...input.expected, files: f.attempt.files },
  }, {
    rpc: f.rpc, download: () => { downloads++; return Promise.resolve(png); }, pause: noPause,
    fetcher: async () => { provider++; throw new Error("Unexpected"); },
  });
  assert(result.state === "rejected" && result.errorCode === "stale_snapshot" && downloads === 2 && provider === 0);
});

Deno.test("confirmed image hash gates upload, checkpoint, then exactly one publication", async () => {
  const f = fixture();
  const png = new Uint8Array(33);
  png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", png));
  f.attempt.files = [{
    id: "00000000-0000-4000-8000-000000000108", storagePath: "synthetic/original.png",
    mimeType: "image/png", sizeBytes: png.length,
    sha256: Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join(""),
  }];
  let uploads = 0, posts = 0, downloaded = false;
  const result = await publishSavedXPost({
    ...input, fileIds: [f.attempt.files[0].id], expected: { ...input.expected, files: f.attempt.files },
  }, {
    rpc: async (name, args) => {
      if (name === "social_x_publish_dispatch") {
        assert(f.calls.some((c) => c.name === "social_x_publish_media"));
        f.calls.push({ name, args });
        return { accessToken: f.token.accessToken, body: f.attempt.body, mediaIds: ["765432"] };
      }
      return await f.rpc(name, args);
    },
    download: () => { downloaded = true; return Promise.resolve(png); }, pause: noPause,
    fetcher: async (url) => {
      assert(downloaded);
      if (String(url).endsWith("/media/upload")) {
        uploads++;
        return Response.json({ data: { id: "765432", expires_after_secs: 3600 } });
      }
      assert(String(url).endsWith("/tweets"));
      posts++;
      return Response.json({ data: { id: "987654", text: f.attempt.body } }, { status: 201 });
    },
  });
  assert(result.state === "published" && uploads === 1 && posts === 1);
});
