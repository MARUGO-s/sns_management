import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import {
  authorizationUrl,
  callbackUrl,
  normalizeScopes,
  type OAuthConfiguration,
  OAuthError,
  randomValue,
  safeDatabaseError,
  stateHash,
} from "../_shared/x-oauth.ts";
import { isActualWorkspaceMember } from "../_shared/x-oauth-membership.ts";
import { safeOAuthStatus } from "../_shared/x-oauth-status.ts";
import { refreshVerifiedConnection } from "../_shared/x-oauth-refresh-handler.ts";

const socialXOauthFunction = {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "invalid_request" }, { status: 405 });
    }
    try {
      const body = await req.json().catch(() => null);
      if (
        !body ||
        !["configure", "start", "refresh", "status"].includes(body.action) ||
        typeof body.workspaceId !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(body.workspaceId)
      ) throw new OAuthError("invalid_request");
      const { data: { user }, error: userError } = await ctx.supabase.auth
        .getUser();
      if (
        userError || !user ||
        !await isActualWorkspaceMember(
          ctx.supabaseAdmin,
          body.workspaceId,
          user.id,
        )
      ) throw new OAuthError("forbidden", 403);
      const callback = callbackUrl(Deno.env.get("SUPABASE_URL") ?? "");
      const rpc = async (name: string, args: Record<string, unknown>) => {
        const { data, error } = await ctx.supabaseAdmin.rpc(
          name,
          args as never,
        ).abortSignal(AbortSignal.timeout(8000));
        if (error) throw safeDatabaseError(error);
        return data as OAuthConfiguration;
      };
      const status = async () => {
        const { data: i, error: ie } = await ctx.supabaseAdmin.from(
          "social_integrations",
        ).select("id,app_id,status").eq("workspace_id", body.workspaceId).eq(
          "channel",
          "x",
        ).maybeSingle();
        if (ie) throw new OAuthError("storage_failed", 500);
        if (!i) {
          return safeOAuthStatus(null, null, null, callback);
        }
        const [{ data: s, error: se }, { data: c, error: ce }] = await Promise
          .all([
            ctx.supabaseAdmin.from("social_integration_secrets").select(
              "client_secret,access_token,refresh_token,webhook_secret",
            ).eq("integration_id", i.id).maybeSingle(),
            ctx.supabaseAdmin.from("social_x_oauth_configs").select(
              "revision,token_revision,expires_at,account_id,account_username",
            ).eq("integration_id", i.id).maybeSingle(),
          ]);
        if (se || ce) throw new OAuthError("storage_failed", 500);
        return safeOAuthStatus(i, c, s, callback);
      };
      if (body.action === "status") return Response.json(await status());
      if (body.action === "configure") {
        if (
          typeof body.appId !== "string" || !body.appId.trim() ||
          body.appId.trim().length > 512 ||
          body.clientSecret !== undefined &&
            typeof body.clientSecret !== "string"
        ) throw new OAuthError("invalid_request");
        const secret = (body.clientSecret ?? "").trim();
        if (secret.length > 65536) throw new OAuthError("invalid_request");
        await rpc("social_x_oauth_configure", {
          p_workspace: body.workspaceId,
          p_user: user.id,
          p_app_id: body.appId.trim(),
          p_client_secret: secret,
          p_scopes: normalizeScopes(body.scopes),
          p_callback: callback,
        });
        return Response.json({ ok: true, ...await status() });
      }
      if (body.action === "start") {
        const state = randomValue(), verifier = randomValue();
        const config = await rpc("social_x_oauth_begin", {
          p_workspace: body.workspaceId,
          p_user: user.id,
          p_hash: await stateHash(state),
          p_verifier: verifier,
        });
        return Response.json({
          authorizationUrl: await authorizationUrl(
            config.appId,
            callback,
            state,
            verifier,
            config.scopes,
          ),
          callbackUrl: callback,
        });
      }
      const lease = crypto.randomUUID();
      const config = await rpc("social_x_oauth_refresh_claim", {
        p_workspace: body.workspaceId,
        p_user: user.id,
        p_lease: lease,
      });
      let releaseLease = false;
      try {
        await refreshVerifiedConnection(config, user.id, lease, rpc);
        releaseLease = true;
        return Response.json({ ok: true, ...await status() });
      } catch (error) {
        // Unknown persistence outcomes keep the 60-second lease until expiry, preventing
        // another refresh from racing a possibly committed/lost-response rotation.
        releaseLease ||= error instanceof OAuthError &&
          error.code !== "storage_failed";
        throw error;
      } finally {
        // Release only our lease; never unlock a later concurrent refresh.
        if (releaseLease) {
          await ctx.supabaseAdmin.rpc(
            "social_x_oauth_refresh_release",
            { p_integration: config.integrationId, p_lease: lease } as never,
          ).abortSignal(AbortSignal.timeout(8000));
        }
      }
    } catch (error) {
      const safe = error instanceof OAuthError
        ? error
        : new OAuthError("storage_failed", 500);
      return Response.json({ error: safe.code }, { status: safe.status });
    }
  }),
};
export default socialXOauthFunction;
