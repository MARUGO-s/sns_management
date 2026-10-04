import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { isActualWorkspaceMember } from "../_shared/x-oauth-membership.ts";
import {
  PUBLICATION_ERRORS,
  publicationErrorCode,
  publishSavedXPost,
  validatePublicationExpected,
} from "../_shared/x-publish-handler.ts";
import { OAuthError } from "../_shared/x-oauth.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Bound streams before allocation. Never log signed URLs, bodies or credentials. */
async function boundedBytes(response: Response, max: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new OAuthError("storage_failed");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new OAuthError("invalid_request");
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
const socialXPublishFunction = {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "invalid_request" }, { status: 405 });
    }
    try {
      const bytes = await boundedBytes(new Response(req.body), 65536);
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (
        !body || !["publish", "status", "preview"].includes(body.action)
      ) throw new OAuthError("invalid_request");
      const { data: { user }, error: ue } = await ctx.supabase.auth.getUser();
      if (ue || !user) throw new OAuthError("forbidden", 403);
      const rpc = async (name: string, args: Record<string, unknown>) => {
        const { data, error } = await ctx.supabaseAdmin.rpc(name, args as never)
          .abortSignal(AbortSignal.timeout(8000));
        if (error) {
          const code = PUBLICATION_ERRORS.has(error.message)
            ? error.message
            : "storage_failed";
          throw Object.assign(new Error(code), {
            code, definitive: error.code === "P0001" && PUBLICATION_ERRORS.has(error.message),
          });
        }
        return data;
      };
      if (body.action === "preview") {
        if (
          typeof body.workspaceId !== "string" || !UUID.test(body.workspaceId) ||
          !await isActualWorkspaceMember(ctx.supabaseAdmin, body.workspaceId, user.id)
        ) throw new OAuthError("forbidden", 403);
        // DB-only connection identity. Never tokens, refresh, or provider calls.
        const connection = await rpc("social_x_publish_connection", {
          p_workspace: body.workspaceId, p_user: user.id,
        }) as { fingerprint?: unknown; username?: unknown };
        if (typeof connection?.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(connection.fingerprint)) {
          throw new OAuthError("storage_failed", 503);
        }
        return Response.json({
          fingerprint: connection.fingerprint,
          ...(typeof connection.username === "string" && /^[a-zA-Z0-9_]{1,15}$/.test(connection.username)
            ? { username: connection.username } : {}),
        });
      }
      if (typeof body.postId !== "string" || !UUID.test(body.postId)) {
        throw new OAuthError("invalid_request");
      }
      const { data: post, error: pe } = await ctx.supabaseAdmin.from(
        "social_posts",
      ).select("workspace_id").eq("id", body.postId).maybeSingle();
      if (
        pe || !post ||
        !await isActualWorkspaceMember(
          ctx.supabaseAdmin, post.workspace_id, user.id,
        )
      ) throw new OAuthError("forbidden", 403);
      if (body.action === "status") {
        const { data: attempts, error } = await ctx.supabaseAdmin.from(
          "social_x_publication_attempts",
        ).select(
          "id,request_id,state,remote_post_id,error_code,created_at,updated_at",
        ).eq("post_id", body.postId).order("created_at", { ascending: false })
          .limit(1);
        if (error) throw new OAuthError("storage_failed", 503);
        const a = attempts?.[0];
        if (!a) return Response.json({ state: "not_started" });
        const orphan = a.state === "sending" &&
          Date.now() - Date.parse(a.updated_at) > 120000;
        return Response.json({
          state: orphan ? "unknown" : a.state,
          attemptId: a.id,
          requestId: a.request_id,
          ...(/^\d{1,30}$/.test(a.remote_post_id ?? "")
            ? { remotePostId: a.remote_post_id }
            : {}),
          ...(orphan
            ? { errorCode: "unknown_result" }
            : PUBLICATION_ERRORS.has(a.error_code)
            ? { errorCode: a.error_code }
            : {}),
        });
      }
      if (
        typeof body.requestId !== "string" || !UUID.test(body.requestId) ||
        !Array.isArray(body.fileIds) || body.fileIds.length > 4 ||
        body.fileIds.some((id: unknown) =>
          typeof id !== "string" || !UUID.test(id)
        ) || new Set(body.fileIds).size !== body.fileIds.length
      ) throw new OAuthError("invalid_request");
      const expected = validatePublicationExpected(body.expected, body.fileIds);
      const result = await publishSavedXPost({
        postId: body.postId,
        userId: user.id,
        requestId: body.requestId,
        fileIds: body.fileIds,
        expected,
      }, {
        rpc,
        download: async (file) => {
          if (
            file.sizeBytes < 1 || file.sizeBytes > 20 * 1024 * 1024 ||
            !file.storagePath.startsWith(
              `${post.workspace_id}/${body.postId}/`,
            )
          ) throw new OAuthError("invalid_request");
          const { data, error } = await ctx.supabaseAdmin.storage.from(
            "social-post-files",
          ).createSignedUrl(file.storagePath, 60);
          if (error || !data?.signedUrl) {
            throw new OAuthError("storage_failed", 503);
          }
          const signed = new URL(data.signedUrl);
          const project = new URL(Deno.env.get("SUPABASE_URL") ?? "");
          if (
            signed.origin !== project.origin || signed.username ||
            signed.password ||
            !signed.pathname.startsWith(
              "/storage/v1/object/sign/social-post-files/",
            )
          ) throw new OAuthError("invalid_request");
          const response = await fetch(signed.href, {
            signal: AbortSignal.timeout(20000), redirect: "error",
          });
          if (!response.ok) throw new OAuthError("storage_failed", 503);
          const original = await boundedBytes(response, file.sizeBytes);
          if (original.length !== file.sizeBytes) {
            throw new OAuthError("invalid_request");
          }
          return original;
        },
      });
      return Response.json(result);
    } catch (error) {
      const code = publicationErrorCode(error);
      const proof = error as { notStarted?: unknown; requestId?: unknown };
      return Response.json({
        error: code,
        ...(proof?.notStarted === true && typeof proof.requestId === "string" && UUID.test(proof.requestId)
          ? { notStarted: true, requestId: proof.requestId } : {}),
      }, {
        status: code === "forbidden" ? 403 : code === "storage_failed" ? 503 : 400,
      });
    }
  }),
};
export default socialXPublishFunction;
