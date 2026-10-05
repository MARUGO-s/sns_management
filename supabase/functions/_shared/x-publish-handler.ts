import {
  checkXMedia,
  createXPost,
  uploadXMedia,
  validateMediaBytes,
  validateXPayload,
} from "./x-publish-provider.ts";
import { refreshVerifiedConnection } from "./x-oauth-refresh-handler.ts";
import { type OAuthConfiguration, OAuthError } from "./x-oauth.ts";

type Media = {
  id: string;
  expiresAt: string;
  state: "ready" | "pending";
  nextCheckAt?: string;
};
type FileSnapshot = {
  id: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};
export type PublicationExpected = {
  body: string;
  files: FileSnapshot[];
  connectionFingerprint: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Validate the public envelope before RPC. SQL remains the authoritative gate. */
export function validatePublicationExpected(value: unknown, fileIds: string[]): PublicationExpected {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OAuthError("invalid_request");
  }
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some((key) => !["body", "files", "connectionFingerprint"].includes(key)) ||
    typeof data.body !== "string" || [...data.body].length > 10000 ||
    !Array.isArray(data.files) || data.files.length !== fileIds.length ||
    typeof data.connectionFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(data.connectionFingerprint)
  ) throw new OAuthError("invalid_request");
  for (const [index, file] of data.files.entries()) {
    if (
      !file || typeof file !== "object" || Array.isArray(file) ||
      Object.keys(file).some((key) => !["id", "storagePath", "mimeType", "sizeBytes", "sha256"].includes(key)) ||
      typeof file.id !== "string" || !UUID.test(file.id) || file.id !== fileIds[index] ||
      typeof file.storagePath !== "string" || file.storagePath.length > 1024 ||
      !file.storagePath || typeof file.mimeType !== "string" ||
      !["image/jpeg", "image/png", "video/mp4"].includes(file.mimeType) ||
      !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 1 || file.sizeBytes > 20 * 1024 * 1024 ||
      typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)
    ) throw new OAuthError("invalid_request");
  }
  return data as PublicationExpected;
}
type Attempt = {
  attemptId: string;
  workspaceId: string;
  requestId: string;
  state: "preparing" | "sending" | "published" | "rejected" | "unknown";
  claimed: boolean;
  body: string;
  files: FileSnapshot[];
  media: Media[];
  remotePostId?: string;
  errorCode?: string;
};
type Token = {
  accessToken: string;
  expiresAt: string;
  integrationId: string;
  workspaceId: string;
  needsRefresh: boolean;
};
export type PublicationStatus = {
  state: Attempt["state"];
  attemptId: string;
  requestId: string;
  remotePostId?: string;
  errorCode?: string;
  nextCheckAt?: string;
};
export const PUBLICATION_ERRORS = new Set([
  "invalid_request", "forbidden", "not_connected", "not_configured", "busy",
  "stale_snapshot", "unsupported_media", "publication_locked", "already_published",
  "media_expired", "storage_failed", "invalid_text", "media_too_large",
  "invalid_media", "media_failed", "provider_unavailable", "authorization_failed",
  "invalid_token", "rate_limited", "provider_rejected", "unknown_result",
  "invalid_state",
  "media_permission_required", "schedule_not_ready", "schedule_cancelled",
]);
export function publicationErrorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (code === "text_too_long") return "invalid_text";
  if (code === "media_processing_failed") return "media_failed";
  if (code === "invalid_provider_response") return "provider_unavailable";
  return typeof code === "string" && PUBLICATION_ERRORS.has(code)
    ? code
    : "storage_failed";
}
function publicStatus(a: Attempt): PublicationStatus {
  const pending = a.media?.filter((m) => m.state === "pending");
  return {
    state: a.state,
    attemptId: a.attemptId,
    requestId: a.requestId,
    ...(a.remotePostId && /^\d{1,30}$/.test(a.remotePostId)
      ? { remotePostId: a.remotePostId }
      : {}),
    ...(a.errorCode && PUBLICATION_ERRORS.has(a.errorCode)
      ? { errorCode: a.errorCode }
      : {}),
    ...(pending?.length && pending[0].nextCheckAt
      ? { nextCheckAt: pending[0].nextCheckAt }
      : {}),
  };
}
type Dependencies = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  download: (file: FileSnapshot) => Promise<Uint8Array>;
  fetcher?: typeof fetch;
  pause?: (ms: number) => Promise<void>;
};
/** All provider calls are explicit and injected for tests.
 * preparing can safely resume media processing, but sending is never reclaimed.
 * Only an identical database finish is retried; never a public provider write.
 */
export async function publishSavedXPost(
  input: { postId: string; userId: string; requestId: string; fileIds: string[]; expected: PublicationExpected },
  deps: Dependencies,
): Promise<PublicationStatus> {
  const rpc = deps.rpc;
  const preparationDeadline = Date.now() + 75000;
  const requireTime = () => {
    if (Date.now() >= preparationDeadline) {
      throw new OAuthError("provider_unavailable", 503);
    }
  };
  const mediaFetcher: typeof fetch = (url, options) => {
    requireTime();
    const init = options as RequestInit | undefined;
    const signals = [
      AbortSignal.timeout(Math.max(1, preparationDeadline - Date.now())),
    ];
    if (init?.signal) signals.push(init.signal);
    return (deps.fetcher ?? fetch)(url, {
      ...init, signal: AbortSignal.any(signals),
    });
  };
  const pause = deps.pause ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const lease = crypto.randomUUID();
  let a: Attempt;
  try {
    a = await rpc("social_x_publish_prepare", {
      p_post: input.postId,
      p_user: input.userId,
      p_request: input.requestId,
      p_files: input.fileIds,
      p_lease: lease,
      p_expected: input.expected,
    }) as Attempt;
  } catch (error) {
    // Only a known SQL rollback of the initial gate proves this request never
    // started. Neither a later status read nor transport failure proves that.
    if ((error as { definitive?: boolean })?.definitive === true) {
      throw Object.assign(new Error(publicationErrorCode(error)), {
        code: publicationErrorCode(error), notStarted: true, requestId: input.requestId,
      });
    }
    throw error;
  }
  if (!a.claimed) return publicStatus(a);
  const finish = async (
    state: "published" | "rejected" | "unknown",
    remote: string | null,
    error: string | null,
  ) => {
    const args = {
      p_attempt: a.attemptId,
      p_lease: lease,
      p_state: state,
      p_remote: remote,
      p_error: error,
    };
    for (let retry = 0; retry < 3; retry++) {
      try {
        if (await rpc("social_x_publish_finish", args) !== true) {
          throw new OAuthError("storage_failed", 503);
        }
        return true;
      } catch {
        if (retry < 2) await pause(100 * (retry + 1));
      }
    }
    return false;
  };
  let dispatchStarted = false;
  try {
    validateXPayload(a.body, a.files);
    // Verify ALL originals before refresh or upload: no partially uploaded
    // attachment set when a later file was replaced after confirmation.
    const originals: Uint8Array[] = [];
    if (!a.media?.length) {
      for (const file of a.files) {
        requireTime();
        const bytes = await deps.download(file);
        requireTime();
        validateMediaBytes(bytes, file.mimeType, file.sizeBytes);
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
        const hash = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
        if (hash !== file.sha256) {
          throw Object.assign(new Error("stale_snapshot"), { code: "stale_snapshot" });
        }
        originals.push(bytes);
      }
    }
    let token = await rpc("social_x_publish_token", {
      p_attempt: a.attemptId, p_user: input.userId, p_lease: lease,
    }) as Token;
    if (token.needsRefresh) {
      const refreshLease = crypto.randomUUID();
      const config = await rpc("social_x_oauth_refresh_claim", {
        p_workspace: a.workspaceId,
        p_user: input.userId,
        p_lease: refreshLease,
      }) as OAuthConfiguration;
      let release = false;
      try {
        await refreshVerifiedConnection(
          config, input.userId, refreshLease, rpc, deps.fetcher, pause,
        );
        release = true;
      } catch (error) {
        release = error instanceof OAuthError && error.code !== "storage_failed";
        throw error;
      } finally {
        if (release) {
          await rpc("social_x_oauth_refresh_release", {
            p_integration: config.integrationId, p_lease: refreshLease,
          });
        }
      }
      token = await rpc("social_x_publish_token", {
        p_attempt: a.attemptId, p_user: input.userId, p_lease: lease,
      }) as Token;
    }
    if (token.needsRefresh || !token.accessToken) {
      throw new OAuthError("not_connected");
    }
    let media = a.media ?? [];
    if (media.length !== 0 && media.length !== a.files.length) {
      throw new OAuthError("invalid_state");
    }
    if (!media.length) {
      // No publication can happen before every original file is downloaded,
      // validated and uploaded. Upload failures only reject this preparation.
      media = [];
      for (const [index, file] of a.files.entries()) {
        requireTime();
        media.push(
          await uploadXMedia(
            token.accessToken, originals[index], file.mimeType, mediaFetcher,
          ),
        );
      }
    } else {
      media = await Promise.all(
        media.map((m) =>
          m.state === "pending"
            ? checkXMedia(token.accessToken, m, mediaFetcher)
            : Promise.resolve(m)
        ),
      );
    }
    const pending = media.some((m) => m.state === "pending");
    await rpc("social_x_publish_media", {
      p_attempt: a.attemptId,
      p_user: input.userId,
      p_lease: lease,
      p_media: media,
      p_release: pending,
    });
    if (pending) return publicStatus({ ...a, media, state: "preparing" });
    requireTime();
    // Set this before RPC: even a lost dispatch response may have committed
    // durable sending. Do not retry the gate or infer it is safe to resend.
    dispatchStarted = true;
    let dispatch: { accessToken: string; body: string; mediaIds: string[] };
    try {
      dispatch = await rpc("social_x_publish_dispatch", {
        p_attempt: a.attemptId, p_user: input.userId, p_lease: lease,
      }) as typeof dispatch;
    } catch (error) {
      // P0001 is a definitive SQL exception and rolls back the gate. A lost
      // response can instead have committed sending and must stay uncertain.
      if ((error as { definitive?: boolean })?.definitive === true) dispatchStarted = false;
      throw error;
    }
    const text = validateXPayload(dispatch.body, a.files);
    const result = await createXPost(
      dispatch.accessToken, text, dispatch.mediaIds, deps.fetcher,
    );
    const persisted = await finish(
      result.state, result.remotePostId ?? null, result.errorCode ?? null,
    );
    if (!persisted) {
      // A success receipt might have committed. Return uncertainty, not a
      // rejection which would encourage another publication request.
      return publicStatus({ ...a, state: "unknown", errorCode: "unknown_result" });
    }
    return publicStatus({ ...a, ...result });
  } catch (error) {
    const state = dispatchStarted ? "unknown" : "rejected";
    const code = dispatchStarted ? "unknown_result" : publicationErrorCode(error);
    const persisted = await finish(state, null, code);
    return publicStatus({
      ...a,
      state: persisted ? state : "unknown",
      errorCode: persisted ? code : "unknown_result",
    });
  }
}
