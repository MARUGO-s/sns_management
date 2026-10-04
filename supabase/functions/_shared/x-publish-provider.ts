/**
 * X publication protocol, with no retries or caller-controlled provider URLs.
 * Never log tokens, bodies, bytes, or raw provider responses.
 *
 * Contract: https://docs.x.com/openapi.json
 * https://docs.x.com/x-api/posts/create-post
 * https://docs.x.com/x-api/media/upload-media
 * https://docs.x.com/x-api/media/initialize-media-upload
 * https://docs.x.com/x-api/media/append-media-upload
 * https://docs.x.com/x-api/media/finalize-media-upload
 * https://docs.x.com/x-api/media/get-media-upload-status
 *
 * OpenAPI requires OAuth2UserToken media.write for ALL upload/status endpoints.
 * Existing connections without that scope must be reauthorized before media use.
 */
import twitterText from "npm:twitter-text@3.1.0";

export type PublicationErrorCode =
  | "invalid_request"
  | "text_too_long"
  | "invalid_media"
  | "media_too_large"
  | "media_expired"
  | "media_processing_failed"
  | "provider_unavailable"
  | "authorization_failed"
  | "rate_limited"
  | "provider_rejected"
  | "invalid_provider_response";

export class PublicationError extends Error {
  constructor(public code: PublicationErrorCode, public status = 400) {
    super(code);
  }
}

export const X_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
// Deliberately conservative application limit, not a claim about X's maximum.
export const X_VIDEO_MAX_BYTES = 20 * 1024 * 1024;
export const X_MEDIA_SCOPES = ["media.write"] as const;
const CHUNK_BYTES = 1024 * 1024;
const RESPONSE_MAX_BYTES = 65536;
const REQUEST_TIMEOUT_MS = 10000;
const ID = /^[0-9]{1,19}$/;
const API = "https://api.x.com/2";
export type XMedia = {
  id: string;
  expiresAt: string;
  state: "ready" | "pending";
  nextCheckAt?: string;
};
export type XPostResult = {
  state: "published" | "rejected" | "unknown";
  remotePostId?: string;
  errorCode?: PublicationErrorCode;
};
type MediaFile = { mimeType: string; sizeBytes: number };

function checkMediaMetadata(mime: string, size: number): void {
  if (!["image/jpeg", "image/png", "video/mp4"].includes(mime)) {
    throw new PublicationError("invalid_media");
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new PublicationError("invalid_media");
  }
  if (size > (mime === "video/mp4" ? X_VIDEO_MAX_BYTES : X_IMAGE_MAX_BYTES)) {
    throw new PublicationError("media_too_large");
  }
}

/** Return the NFC-normalized body; weighted lengths use the official parser. */
export function validateXPayload(body: string, files: MediaFile[]): string {
  if (
    typeof body !== "string" || !body.trim() ||
    body.length > 20000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body) ||
    !Array.isArray(files) || files.length > 4
  ) throw new PublicationError("invalid_request");
  const text = body.normalize("NFC");
  const parsed = twitterText.parseTweet(text);
  if (parsed.weightedLength > 280) {
    throw new PublicationError("text_too_long");
  }
  if (!parsed.valid) throw new PublicationError("invalid_request");
  for (const file of files) {
    if (!file || typeof file !== "object") {
      throw new PublicationError("invalid_media");
    }
    checkMediaMetadata(file.mimeType, file.sizeBytes);
  }
  if (
    files.some((f) => f.mimeType === "video/mp4") &&
    (files.length !== 1 || files[0].mimeType !== "video/mp4")
  ) throw new PublicationError("invalid_media");
  return text;
}

/** Validate declarations against bytes before any external request. */
export function validateMediaBytes(
  bytes: Uint8Array,
  mime: string,
  size: number,
): void {
  checkMediaMetadata(mime, size);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== size) {
    throw new PublicationError("invalid_media");
  }
  let valid = false;
  if (mime === "image/jpeg") {
    valid = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
      bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff &&
      bytes[bytes.length - 1] === 0xd9;
  } else if (mime === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    valid = bytes.length >= 33 && signature.every((v, i) => bytes[i] === v) &&
      bytes[8] === 0 && bytes[9] === 0 && bytes[10] === 0 && bytes[11] === 13 &&
      new TextDecoder().decode(bytes.subarray(12, 16)) === "IHDR";
  } else if (mime === "video/mp4") {
    if (bytes.length >= 16) {
      const boxSize = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      ).getUint32(0);
      // Require a complete first ftyp box and a recognised MP4-compatible brand.
      const brands = new Set([
        "isom",
        "iso2",
        "iso3",
        "iso4",
        "iso5",
        "iso6",
        "mp41",
        "mp42",
        "avc1",
        "M4V ",
        "dash",
      ]);
      valid = boxSize >= 16 && boxSize <= bytes.length &&
        new TextDecoder().decode(bytes.subarray(4, 8)) === "ftyp" &&
        brands.has(new TextDecoder().decode(bytes.subarray(8, 12)));
    }
  }
  if (!valid) throw new PublicationError("invalid_media");
}

function headers(token: string, json = false): Record<string, string> {
  if (!token || token.length > 16384 || /[\r\n]/.test(token)) {
    throw new PublicationError("authorization_failed");
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function rejectCode(status: number): PublicationErrorCode {
  if (status === 401 || status === 403) return "authorization_failed";
  if (status === 429) return "rate_limited";
  return "provider_rejected";
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const length = response.headers.get("content-length");
  if (
    length && (!/^\d+$/.test(length) || Number(length) > RESPONSE_MAX_BYTES)
  ) {
    await response.body?.cancel();
    throw new PublicationError("invalid_provider_response", 502);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new PublicationError("invalid_provider_response", 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > RESPONSE_MAX_BYTES) {
      await reader.cancel();
      throw new PublicationError("invalid_provider_response", 502);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!object(data)) throw new Error();
    return data;
  } catch {
    throw new PublicationError("invalid_provider_response", 502);
  }
}

async function request(
  path: string,
  init: RequestInit,
  fetcher: typeof fetch,
  deadlineAt = Date.now() + REQUEST_TIMEOUT_MS,
): Promise<{ status: number; data?: Record<string, unknown> }> {
  const timeout = Math.min(REQUEST_TIMEOUT_MS, deadlineAt - Date.now());
  if (timeout <= 0) throw new PublicationError("provider_unavailable", 502);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new PublicationError("provider_unavailable", 502));
    }, timeout);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(API + path, {
          ...init,
          signal: controller.signal,
          redirect: "error",
        });
        // Do not read rejection bodies: they can contain credentials/body echoes.
        if (!response.ok) {
          await response.body?.cancel();
          return { status: response.status };
        }
        return { status: response.status, data: await readJson(response) };
      })(),
      deadline,
    ]);
  } catch (error) {
    if (error instanceof PublicationError) throw error;
    throw new PublicationError("provider_unavailable", 502);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}

async function mediaRequest(
  path: string,
  init: RequestInit,
  fetcher: typeof fetch,
  deadlineAt?: number,
): Promise<Record<string, unknown>> {
  const response = await request(path, init, fetcher, deadlineAt);
  if (response.status !== 200 || !response.data || response.data.errors) {
    throw new PublicationError(
      response.status >= 400 && response.status < 500
        ? rejectCode(response.status)
        : "provider_unavailable",
      502,
    );
  }
  if (!object(response.data.data)) {
    throw new PublicationError("invalid_provider_response", 502);
  }
  return response.data.data;
}

function mediaState(
  data: Record<string, unknown>,
  now: number,
  prior?: XMedia,
): XMedia {
  if (typeof data.id !== "string" || !ID.test(data.id)) {
    throw new PublicationError("invalid_provider_response", 502);
  }
  if (prior && prior.id !== data.id) {
    throw new PublicationError("invalid_provider_response", 502);
  }
  const seconds = data.expires_after_secs;
  let expiresAt: string;
  if (seconds !== undefined) {
    if (
      !Number.isSafeInteger(seconds) || Number(seconds) <= 0 ||
      Number(seconds) > 604800
    ) {
      throw new PublicationError("invalid_provider_response", 502);
    }
    // A subsequent status reply must not silently extend the saved upload lease.
    expiresAt = new Date(
      Math.min(
        now + Number(seconds) * 1000,
        prior ? Date.parse(prior.expiresAt) : Infinity,
      ),
    ).toISOString();
  } else if (prior) expiresAt = prior.expiresAt;
  else throw new PublicationError("invalid_provider_response", 502);
  if (Date.parse(expiresAt) <= now) {
    throw new PublicationError("media_expired");
  }
  const processing = data.processing_info;
  if (processing === undefined) {
    return { id: data.id, expiresAt, state: "ready" };
  }
  if (!object(processing)) {
    throw new PublicationError("invalid_provider_response", 502);
  }
  if (processing.state === "failed") {
    throw new PublicationError("media_processing_failed", 502);
  }
  if (processing.state === "succeeded") {
    return { id: data.id, expiresAt, state: "ready" };
  }
  if (!["pending", "in_progress"].includes(String(processing.state))) {
    throw new PublicationError("invalid_provider_response", 502);
  }
  const wait = processing.check_after_secs ?? 5;
  if (!Number.isSafeInteger(wait) || Number(wait) < 0 || Number(wait) > 3600) {
    throw new PublicationError("invalid_provider_response", 502);
  }
  return {
    id: data.id,
    expiresAt,
    state: "pending",
    nextCheckAt: new Date(now + Math.max(1, Number(wait)) * 1000).toISOString(),
  };
}

/** Images use simple multipart; MP4 uses sequential 1MiB chunks, with no polling. */
export async function uploadXMedia(
  token: string,
  bytes: Uint8Array,
  mime: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
  clock: () => number = () => performance.now(),
): Promise<XMedia> {
  const clockStartedAt = clock();
  const receivedNow = () =>
    now + Math.max(0, Math.floor(clock() - clockStartedAt));
  const deadlineAt = Date.now() + 90000;
  validateMediaBytes(bytes, mime, bytes.byteLength);
  const authHeaders = headers(token);
  if (mime !== "video/mp4") {
    const form = new FormData();
    form.set("media", new Blob([bytes.slice()], { type: mime }), "media");
    form.set("media_category", "tweet_image");
    return mediaState(
      await mediaRequest(
        "/media/upload",
        {
          method: "POST",
          headers: authHeaders,
          body: form,
        },
        fetcher,
        deadlineAt,
      ),
      now,
    );
  }
  const initial = await mediaRequest(
    "/media/upload/initialize",
    {
      method: "POST",
      headers: headers(token, true),
      body: JSON.stringify({
        total_bytes: bytes.byteLength,
        media_type: mime,
        media_category: "tweet_video",
      }),
    },
    fetcher,
    deadlineAt,
  );
  const saved = mediaState(initial, now);
  for (
    let offset = 0, segment = 0;
    offset < bytes.length;
    offset += CHUNK_BYTES, segment++
  ) {
    const form = new FormData();
    form.set(
      "media",
      new Blob([bytes.slice(offset, offset + CHUNK_BYTES)], {
        type: "application/octet-stream",
      }),
      "segment",
    );
    form.set("segment_index", String(segment));
    await mediaRequest(
      `/media/upload/${saved.id}/append`,
      {
        method: "POST",
        headers: authHeaders,
        body: form,
      },
      fetcher,
      deadlineAt,
    );
  }
  const finalized = await mediaRequest(
    `/media/upload/${saved.id}/finalize`,
    {
      method: "POST",
      headers: authHeaders,
    },
    fetcher,
    deadlineAt,
  );
  // Processing wait starts at FINALIZE response receipt, not upload start.
  // The initialization lease remains a conservative cap and cannot be extended.
  return mediaState(finalized, receivedNow(), saved);
}

/** A single explicit status check; caller persists pending state and lease. */
export async function checkXMedia(
  token: string,
  media: XMedia,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
  clock: () => number = () => performance.now(),
): Promise<XMedia> {
  const clockStartedAt = clock();
  if (
    !media || !ID.test(media.id) ||
    !Number.isFinite(Date.parse(media.expiresAt)) ||
    !["ready", "pending"].includes(media.state)
  ) throw new PublicationError("invalid_media");
  if (Date.parse(media.expiresAt) <= now) {
    throw new PublicationError("media_expired");
  }
  if (media.state === "ready") return media;
  if (media.nextCheckAt) {
    if (!Number.isFinite(Date.parse(media.nextCheckAt))) {
      throw new PublicationError("invalid_media");
    }
    if (Date.parse(media.nextCheckAt) > now) return media;
  }
  const data = await mediaRequest(
    `/media/upload?media_id=${media.id}&command=STATUS`,
    { method: "GET", headers: headers(token) },
    fetcher,
  );
  return mediaState(
    data,
    now + Math.max(0, Math.floor(clock() - clockStartedAt)),
    media,
  );
}

/** Exactly one create write. Ambiguous results are NEVER retried automatically. */
export async function createXPost(
  token: string,
  text: string,
  mediaIds: string[],
  fetcher: typeof fetch = fetch,
): Promise<XPostResult> {
  const normalized = validateXPayload(text, []);
  if (
    !Array.isArray(mediaIds) || mediaIds.length > 4 ||
    mediaIds.some((id) => typeof id !== "string" || !ID.test(id)) ||
    new Set(mediaIds).size !== mediaIds.length
  ) throw new PublicationError("invalid_media");
  const authHeaders = headers(token, true);
  try {
    const response = await request("/tweets", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        text: normalized,
        ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}),
      }),
    }, fetcher);
    // 408/499 and other unrecognised responses may be intermediary timeouts.
    if (
      [400, 401, 402, 403, 404, 409, 413, 415, 422, 429].includes(
        response.status,
      )
    ) {
      return { state: "rejected", errorCode: rejectCode(response.status) };
    }
    if (
      response.status === 201 &&
      response.data && !response.data.errors && object(response.data.data) &&
      typeof response.data.data.id === "string" &&
      ID.test(response.data.data.id) &&
      typeof response.data.data.text === "string" &&
      response.data.data.text.length <= 20000
    ) {
      return { state: "published", remotePostId: response.data.data.id };
    }
    return { state: "unknown", errorCode: "provider_unavailable" };
  } catch {
    // Even malformed/oversized success responses may accompany a published post.
    return { state: "unknown", errorCode: "provider_unavailable" };
  }
}
