import {
  checkXMedia,
  createXPost,
  PublicationError,
  uploadXMedia,
  validateMediaBytes,
  validateXPayload,
  X_IMAGE_MAX_BYTES,
  X_VIDEO_MAX_BYTES,
} from "./x-publish-provider.ts";

function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
async function rejects(fn: () => unknown, code: string) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof PublicationError && error.code === code);
    return;
  }
  throw new Error(`expected ${code}`);
}
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}
function jpeg(size = 10) {
  const bytes = new Uint8Array(size);
  bytes.set([255, 216, 255]);
  bytes.set([255, 217], size - 2);
  return bytes;
}
function png() {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  return bytes;
}
function mp4(size = 1024 * 1024 + 4) {
  const bytes = new Uint8Array(size);
  bytes.set([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0]);
  return bytes;
}
const NEVER: typeof fetch = () => {
  throw new Error("unexpected fetch");
};

Deno.test("weighted Japanese, emoji sequences, URL and NFC text validation", async () => {
  assert(validateXPayload("あ".repeat(140), []) === "あ".repeat(140));
  await rejects(() => validateXPayload("あ".repeat(141), []), "text_too_long");
  assert(validateXPayload("👩‍👩‍👧‍👦".repeat(140), []).length > 280);
  await rejects(() => validateXPayload("👩‍👩‍👧‍👦".repeat(141), []), "text_too_long");
  const url = "https://example.com/" + "a".repeat(2000);
  assert(validateXPayload(url, []) === url);
  assert(validateXPayload("e\u0301", []) === "é");
  assert(validateXPayload("A".repeat(280), []).length === 280);
  await rejects(() => validateXPayload("A".repeat(281), []), "text_too_long");
  await rejects(() => validateXPayload(" \n\t ", []), "invalid_request");
  await rejects(() => validateXPayload("a\u0000", []), "invalid_request");
});
Deno.test("server media metadata rejects spoofed types, excessive count, mixed video", async () => {
  validateXPayload("mock", [{
    mimeType: "image/jpeg",
    sizeBytes: X_IMAGE_MAX_BYTES,
  }]);
  validateXPayload("mock", [{
    mimeType: "video/mp4",
    sizeBytes: X_VIDEO_MAX_BYTES,
  }]);
  await rejects(
    () => validateXPayload("mock", [{ mimeType: "image/gif", sizeBytes: 10 }]),
    "invalid_media",
  );
  await rejects(
    () =>
      validateXPayload("mock", [{
        mimeType: "image/jpeg",
        sizeBytes: X_IMAGE_MAX_BYTES + 1,
      }]),
    "media_too_large",
  );
  await rejects(
    () =>
      validateXPayload("mock", [{
        mimeType: "video/mp4",
        sizeBytes: X_VIDEO_MAX_BYTES + 1,
      }]),
    "media_too_large",
  );
  await rejects(() =>
    validateXPayload("mock", [
      { mimeType: "video/mp4", sizeBytes: 20 },
      { mimeType: "image/png", sizeBytes: 20 },
    ]), "invalid_media");
  await rejects(
    () =>
      validateXPayload(
        "mock",
        Array(5).fill({ mimeType: "image/jpeg", sizeBytes: 20 }),
      ),
    "invalid_request",
  );
  await rejects(
    () => validateXPayload("mock", [{ mimeType: "image/jpeg", sizeBytes: 0 }]),
    "invalid_media",
  );
});
Deno.test("byte signatures enforce JPEG, PNG and MP4 and exact size", async () => {
  validateMediaBytes(jpeg(), "image/jpeg", 10);
  validateMediaBytes(png(), "image/png", 33);
  validateMediaBytes(mp4(), "video/mp4", 1024 * 1024 + 4);
  await rejects(
    () => validateMediaBytes(jpeg(), "image/png", 10),
    "invalid_media",
  );
  await rejects(
    () => validateMediaBytes(png(), "image/png", 32),
    "invalid_media",
  );
  const quicktime = mp4();
  quicktime.set(new TextEncoder().encode("qt  "), 8);
  await rejects(
    () => validateMediaBytes(quicktime, "video/mp4", quicktime.length),
    "invalid_media",
  );
  const oversize = mp4();
  oversize.set([127, 255, 255, 255], 0);
  await rejects(
    () => validateMediaBytes(oversize, "video/mp4", oversize.length),
    "invalid_media",
  );
});
Deno.test("images use fixed multipart endpoint, user token and no content-type override", async () => {
  let calls = 0;
  const fake: typeof fetch = async (url, rawInit) => {
    const init = rawInit as RequestInit;
    calls++;
    assert(url === "https://api.x.com/2/media/upload");
    assert(init?.method === "POST" && init.redirect === "error");
    assert(init.signal instanceof AbortSignal);
    const headers = init.headers as Record<string, string>;
    assert(headers.Authorization === "Bearer mock-token");
    assert(!headers["Content-Type"]);
    const form = init.body as FormData;
    assert(form.get("media_category") === "tweet_image");
    const file = form.get("media") as File;
    assert(file.type === "image/jpeg" && file.size === 10);
    return response({ data: { id: "123", expires_after_secs: 3600 } });
  };
  const result = await uploadXMedia(
    "mock-token",
    jpeg(),
    "image/jpeg",
    fake,
    0,
  );
  assert(result.id === "123" && result.state === "ready");
  assert(result.expiresAt === "1970-01-01T01:00:00.000Z");
  assert(calls === 1);
});
Deno.test("MP4 initialization, bounded sequential chunks, finalize return pending without polling", async () => {
  const calls: string[] = [];
  let inFlight = false;
  const fake: typeof fetch = async (url, rawInit) => {
    const init = rawInit as RequestInit;
    assert(!inFlight);
    inFlight = true;
    try {
      const path = String(url).replace("https://api.x.com/2", "");
      calls.push(path);
      assert(init?.method === "POST" && init.redirect === "error");
      if (path.endsWith("/initialize")) {
        const body = JSON.parse(init.body as string);
        assert(
          body.media_type === "video/mp4" &&
            body.media_category === "tweet_video",
        );
        assert(body.total_bytes === 1024 * 1024 + 4);
        return response({ data: { id: "456", expires_after_secs: 3600 } });
      }
      if (path.endsWith("/append")) {
        const form = init.body as FormData;
        const segment = calls.length - 2;
        assert(form.get("segment_index") === String(segment));
        assert(
          (form.get("media") as File).size === (segment ? 4 : 1024 * 1024),
        );
        return response({ data: { expires_at: 3600 } });
      }
      assert(path === "/media/upload/456/finalize" && !init.body);
      return response({
        data: {
          id: "456",
          expires_after_secs: 3600,
          processing_info: { state: "pending", check_after_secs: 3 },
        },
      });
    } finally {
      inFlight = false;
    }
  };
  const result = await uploadXMedia(
    "mock-token",
    mp4(),
    "video/mp4",
    fake,
    0,
    () => 0,
  );
  assert(
    calls.join(",") === [
      "/media/upload/initialize",
      "/media/upload/456/append",
      "/media/upload/456/append",
      "/media/upload/456/finalize",
    ].join(","),
  );
  assert(
    result.state === "pending" &&
      result.nextCheckAt === "1970-01-01T00:00:03.000Z",
  );
});
Deno.test("65s upload schedules processing from final response receipt and retains initial expiry", async () => {
  let clock = 0;
  const calls: string[] = [];
  const result = await uploadXMedia(
    "mock-token",
    mp4(),
    "video/mp4",
    async (url) => {
      const path = String(url).replace("https://api.x.com/2", "");
      calls.push(path);
      if (path.endsWith("/initialize")) {
        return response({ data: { id: "123", expires_after_secs: 3600 } });
      }
      if (path.endsWith("/append")) {
        clock += 30000;
        return response({ data: {} });
      }
      clock += 5000;
      return response({
        data: {
          id: "123",
          expires_after_secs: 3600,
          processing_info: { state: "pending", check_after_secs: 3 },
        },
      });
    },
    0,
    () => clock,
  );
  assert(calls.length === 4 && clock === 65000);
  assert(result.state === "pending");
  assert(result.nextCheckAt === "1970-01-01T00:01:08.000Z");
  assert(Date.parse(result.nextCheckAt!) === clock + 3000);
  assert(result.expiresAt === "1970-01-01T01:00:00.000Z");
});
Deno.test("status waits until next check, polls once, never extends upload expiry", async () => {
  const pending = {
    id: "123",
    expiresAt: "1970-01-01T01:00:00.000Z",
    state: "pending" as const,
    nextCheckAt: "1970-01-01T00:00:03.000Z",
  };
  assert(await checkXMedia("mock-token", pending, NEVER, 2000) === pending);
  let calls = 0;
  const fake: typeof fetch = async (url, rawInit) => {
    const init = rawInit as RequestInit;
    calls++;
    assert(
      url === "https://api.x.com/2/media/upload?media_id=123&command=STATUS",
    );
    assert(init?.method === "GET" && init.redirect === "error");
    return response({
      data: {
        id: "123",
        expires_after_secs: 3600,
        processing_info: { state: "succeeded" },
      },
    });
  };
  const ready = await checkXMedia("mock-token", pending, fake, 3000);
  assert(
    ready.state === "ready" && ready.expiresAt === pending.expiresAt &&
      calls === 1,
  );
  await rejects(
    () => checkXMedia("mock-token", pending, NEVER, 3600000),
    "media_expired",
  );
});
Deno.test("status pending-to-ready accepts a slightly shortened provider TTL without extending expiry", async () => {
  const pending = {
    id: "123",
    expiresAt: "1970-01-01T01:00:00.000Z",
    state: "pending" as const,
    nextCheckAt: "1970-01-01T00:00:03.000Z",
  };
  let clock = 0;
  let calls = 0;
  const ready = await checkXMedia(
    "mock-token",
    pending,
    async () => {
      calls++;
      clock = 500;
      return response({
        data: {
          id: "123",
          expires_after_secs: 3590,
          processing_info: { state: "succeeded" },
        },
      });
    },
    3000,
    () => clock,
  );
  assert(calls === 1 && ready.state === "ready" && !ready.nextCheckAt);
  assert(ready.expiresAt === "1970-01-01T00:59:53.500Z");
  assert(Date.parse(ready.expiresAt) < Date.parse(pending.expiresAt));
});
Deno.test("pending status wait also starts at response receipt rather than request start", async () => {
  const pending = {
    id: "123",
    expiresAt: "1970-01-01T01:00:00.000Z",
    state: "pending" as const,
  };
  let clock = 0;
  const result = await checkXMedia(
    "mock-token",
    pending,
    async () => {
      clock = 5000;
      return response({
        data: {
          id: "123",
          expires_after_secs: 3590,
          processing_info: { state: "in_progress", check_after_secs: 3 },
        },
      });
    },
    3000,
    () => clock,
  );
  assert(result.state === "pending");
  assert(result.nextCheckAt === "1970-01-01T00:00:11.000Z");
  assert(result.expiresAt === "1970-01-01T00:59:58.000Z");
});
Deno.test("status failed and malformed providers are safe errors with no raw data", async () => {
  const pending = {
    id: "123",
    expiresAt: new Date(3600000).toISOString(),
    state: "pending" as const,
  };
  await rejects(
    () =>
      checkXMedia("mock-token", pending, async () =>
        response({
          data: {
            id: "123",
            processing_info: { state: "failed", error: "SECRET" },
          },
        }), 0),
    "media_processing_failed",
  );
  await rejects(
    () =>
      checkXMedia(
        "mock-token",
        pending,
        async () => response({ data: { id: "124" } }),
        0,
      ),
    "invalid_provider_response",
  );
  await rejects(
    () =>
      uploadXMedia(
        "mock-token",
        jpeg(),
        "image/jpeg",
        async () => response({ data: { id: "123" } }),
        0,
      ),
    "invalid_provider_response",
  );
  await rejects(
    () =>
      uploadXMedia(
        "mock-token",
        jpeg(),
        "image/jpeg",
        async () => response({ error: "SECRET" }, 403),
        0,
      ),
    "authorization_failed",
  );
});
Deno.test("create writes exactly once, pins headers/URL, returns only remote id", async () => {
  let calls = 0;
  const result = await createXPost(
    "mock-token",
    "e\u0301",
    ["123"],
    async (url, rawInit) => {
      const init = rawInit as RequestInit;
      calls++;
      assert(url === "https://api.x.com/2/tweets" && init?.method === "POST");
      assert(init.redirect === "error" && init.signal instanceof AbortSignal);
      const headers = init.headers as Record<string, string>;
      assert(headers.Authorization === "Bearer mock-token");
      assert(headers["Content-Type"] === "application/json");
      assert(
        init.body ===
          JSON.stringify({ text: "é", media: { media_ids: ["123"] } }),
      );
      return response({ data: { id: "456", text: "provider body" } }, 201);
    },
  );
  assert(
    calls === 1 && result.state === "published" &&
      result.remotePostId === "456",
  );
  assert(!JSON.stringify(result).includes("provider body"));
});
Deno.test("recognized 4xx rejects safely; timeouts, disconnects, 5xx and malformed success stay unknown", async () => {
  for (
    const [status, code] of [
      [401, "authorization_failed"],
      [403, "authorization_failed"],
      [429, "rate_limited"],
      [422, "provider_rejected"],
    ] as const
  ) {
    let calls = 0;
    const result = await createXPost("mock-token", "mock", [], async () => {
      calls++;
      return response({ private: "SECRET" }, status);
    });
    assert(
      calls === 1 && result.state === "rejected" && result.errorCode === code,
    );
  }
  for (
    const fake of [
      async () => response({ private: "SECRET" }, 500),
      async () => response({ data: { id: "123" } }, 200),
      async () => response({ data: { id: "not-id" } }, 201),
      async () => response({ data: { id: "123" } }, 201),
      async () => response({ private: "SECRET" }, 408),
      async () => new Response("not-json", { status: 201 }),
      async () => {
        throw new DOMException("private details", "AbortError");
      },
      async () => {
        throw new TypeError("private details");
      },
    ]
  ) {
    let calls = 0;
    const result = await createXPost("mock-token", "mock", [], async () => {
      calls++;
      return await fake();
    });
    assert(calls === 1 && result.state === "unknown" && !result.remotePostId);
    assert(!JSON.stringify(result).includes("private"));
  }
});
Deno.test("request deadline aborts an unresponsive transport without retrying", async () => {
  const original = globalThis.setTimeout;
  globalThis.setTimeout =
    ((fn: () => void) => original(fn, 5)) as typeof setTimeout;
  let calls = 0;
  let signal: AbortSignal | undefined;
  try {
    const result = await createXPost(
      "mock-token",
      "mock",
      [],
      async (_url, rawInit) => {
        calls++;
        signal = (rawInit as RequestInit).signal as AbortSignal;
        return await new Promise<Response>((_resolve, reject) => {
          signal!.addEventListener(
            "abort",
            () => reject(new DOMException("deadline", "AbortError")),
          );
        });
      },
    );
    assert(result.state === "unknown" && calls === 1 && signal?.aborted);
  } finally {
    globalThis.setTimeout = original;
  }
});
Deno.test("complete video preparation is bounded to 90s and never creates a post", async () => {
  const original = Date.now;
  let clock = 0;
  Date.now = () => clock;
  const calls: string[] = [];
  try {
    await rejects(
      () =>
        uploadXMedia(
          "mock-token",
          mp4(X_VIDEO_MAX_BYTES),
          "video/mp4",
          async (url) => {
            calls.push(String(url));
            clock += 10000;
            return String(url).endsWith("initialize")
              ? response({ data: { id: "123", expires_after_secs: 3600 } })
              : response({ data: {} });
          },
          0,
        ),
      "provider_unavailable",
    );
    assert(calls.length === 9);
    assert(
      calls.every((url) =>
        !url.endsWith("finalize") && !url.endsWith("tweets")
      ),
    );
  } finally {
    Date.now = original;
  }
});
Deno.test("response size bound covers content length and streaming; no create retries", async () => {
  for (
    const fake of [
      async () =>
        new Response("{}", {
          status: 201,
          headers: { "content-length": "65537" },
        }),
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(65537));
              controller.close();
            },
          }),
          { status: 201 },
        ),
    ]
  ) {
    let calls = 0;
    const result = await createXPost("mock-token", "mock", [], async () => {
      calls++;
      return await fake();
    });
    assert(result.state === "unknown" && calls === 1);
  }
});
Deno.test("validation errors do not make provider requests", async () => {
  await rejects(
    () => createXPost("mock-token", "あ".repeat(141), [], NEVER),
    "text_too_long",
  );
  await rejects(
    () => createXPost("mock-token", "mock", ["123", "123"], NEVER),
    "invalid_media",
  );
  await rejects(
    () => createXPost("mock-token", "mock", ["../token"], NEVER),
    "invalid_media",
  );
  await rejects(
    () => createXPost("mock\r\ntoken", "mock", [], NEVER),
    "authorization_failed",
  );
  await rejects(
    () => uploadXMedia("mock-token", jpeg(), "video/mp4", NEVER),
    "invalid_media",
  );
});
