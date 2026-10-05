import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { handleXScheduledPublish } from "../_shared/x-schedule-handler.ts";

const SAFE_ERRORS = new Set([
  "invalid_request", "forbidden", "not_connected", "not_configured", "busy",
  "stale_snapshot", "unsupported_media", "publication_locked", "already_published",
  "media_expired", "storage_failed", "invalid_text", "media_too_large", "invalid_media",
  "media_failed", "provider_unavailable", "authorization_failed", "invalid_token",
  "rate_limited", "provider_rejected", "unknown_result", "invalid_state",
  "media_permission_required", "schedule_connection_changed", "schedule_attempt_limit",
  "schedule_not_ready", "schedule_cancelled", "schedule_media_checkpoint_incomplete",
]);

async function boundedBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw Object.assign(new Error("storage_failed"), { code: "storage_failed" });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) throw Object.assign(new Error("invalid_request"), { code: "invalid_request" });
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

const socialXScheduledPublishFunction = {
  fetch(req: Request): Promise<Response> {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const secret = Deno.env.get("X_SCHEDULE_CRON_SECRET") ?? null;
    let client: ReturnType<typeof createClient> | null = null;
    const getClient = () => {
      if (!client && supabaseUrl && serviceKey) {
        client = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      }
      if (!client) throw Object.assign(new Error("storage_failed"), { code: "storage_failed" });
      return client;
    };
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const { data, error } = await getClient().rpc(name, args as never)
        .abortSignal(AbortSignal.timeout(8000));
      if (error) {
        const code = SAFE_ERRORS.has(error.message) ? error.message : "storage_failed";
        throw Object.assign(new Error(code), {
          code,
          definitive: error.code === "P0001" && SAFE_ERRORS.has(error.message),
        });
      }
      return data;
    };

    return handleXScheduledPublish(req, {
      secret,
      rpc,
      download: async (file, workspaceId, postId) => {
        if (
          file.sizeBytes < 1 || file.sizeBytes > 20 * 1024 * 1024 ||
          !file.storagePath.startsWith(`${workspaceId}/${postId}/`)
        ) throw Object.assign(new Error("invalid_request"), { code: "invalid_request" });
        const { data, error } = await getClient().storage.from("social-post-files")
          .createSignedUrl(file.storagePath, 60);
        if (error || !data?.signedUrl) {
          throw Object.assign(new Error("storage_failed"), { code: "storage_failed" });
        }
        const signed = new URL(data.signedUrl);
        let project: URL;
        try {
          project = new URL(supabaseUrl);
        } catch {
          throw Object.assign(new Error("storage_failed"), { code: "storage_failed" });
        }
        if (
          signed.origin !== project.origin || signed.username || signed.password ||
          !signed.pathname.startsWith("/storage/v1/object/sign/social-post-files/")
        ) throw Object.assign(new Error("invalid_request"), { code: "invalid_request" });
        const response = await fetch(signed.href, {
          signal: AbortSignal.timeout(20000),
          redirect: "error",
        });
        if (!response.ok) {
          throw Object.assign(new Error("storage_failed"), { code: "storage_failed" });
        }
        const bytes = await boundedBytes(response, file.sizeBytes);
        if (bytes.length !== file.sizeBytes) {
          throw Object.assign(new Error("invalid_request"), { code: "invalid_request" });
        }
        return bytes;
      },
    });
  },
};
export default socialXScheduledPublishFunction;
