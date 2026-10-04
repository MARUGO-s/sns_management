import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { isActualWorkspaceMember } from "../_shared/x-oauth-membership.ts";
import { safeDatabaseError } from "../_shared/x-oauth.ts";

type ChannelId = "instagram" | "tiktok" | "x" | "threads";
type Action = "list" | "save" | "delete";

const channels: ChannelId[] = ["instagram", "tiktok", "x", "threads"];
function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

const integrationSecretsFunction = {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return badRequest("Method not allowed", 405);

    const payload = await req.json().catch(() => null) as {
      action?: Action;
      workspaceId?: string;
      channel?: ChannelId;
      secrets?: Partial<
        Record<
          "clientSecret" | "accessToken" | "refreshToken" | "webhookSecret",
          string
        >
      >;
    } | null;

    if (!payload?.action || !payload.workspaceId) {
      return badRequest("action and workspaceId are required");
    }

    const { data: workspace, error: workspaceError } = await ctx.supabase
      .from("social_workspaces")
      .select("id")
      .eq("id", payload.workspaceId)
      .maybeSingle();

    if (workspaceError) return badRequest(workspaceError.message, 500);
    if (!workspace) return badRequest("Workspace not found", 404);

    if (payload.action === "list") {
      const { data: integrations, error: integrationError } = await ctx.supabase
        .from("social_integrations")
        .select("id, channel")
        .eq("workspace_id", payload.workspaceId);

      if (integrationError) return badRequest(integrationError.message, 500);

      const ids = (integrations ?? []).map((item) => item.id);
      const { data: storedSecrets, error: secretsError } = ids.length
        ? await ctx.supabaseAdmin
          .from("social_integration_secrets")
          .select(
            "integration_id, client_secret, access_token, refresh_token, webhook_secret",
          )
          .in("integration_id", ids)
        : { data: [], error: null };

      if (secretsError) return badRequest(secretsError.message, 500);

      const byIntegration = new Map(
        (storedSecrets ?? []).map((item) => [item.integration_id, item]),
      );
      const status = Object.fromEntries(
        channels.map((channel) => {
          const integration = (integrations ?? []).find((item) =>
            item.channel === channel
          );
          const secret = integration ? byIntegration.get(integration.id) : null;
          return [
            channel,
            {
              clientSecret: Boolean(secret?.client_secret),
              accessToken: Boolean(secret?.access_token),
              refreshToken: Boolean(secret?.refresh_token),
              webhookSecret: Boolean(secret?.webhook_secret),
            },
          ];
        }),
      );

      return Response.json({ status });
    }

    if (!payload.channel || !channels.includes(payload.channel)) {
      return badRequest("A supported channel is required");
    }

    const { data: { user }, error: userError } = await ctx.supabase.auth
      .getUser();
    if (
      userError || !user || !await isActualWorkspaceMember(
        ctx.supabaseAdmin,
        payload.workspaceId,
        user.id,
      )
    ) {
      return badRequest("Workspace membership required", 403);
    }

    if (payload.action !== "save" && payload.action !== "delete") {
      return badRequest("Unsupported action");
    }
    const input = payload.secrets ?? {};
    if (Object.values(input).some((value) => typeof value !== "string")) {
      return badRequest("A credential must be text");
    }
    const incoming = {
      p_client_secret: input.clientSecret?.trim() ?? "",
      p_access_token: input.accessToken?.trim() ?? "",
      p_refresh_token: input.refreshToken?.trim() ?? "",
      p_webhook_secret: input.webhookSecret?.trim() ?? "",
    };
    if (Object.values(incoming).some((value) => value.length > 65536)) {
      return badRequest("A credential is too large");
    }
    // Never fetch and merge old secrets in this worker. The RPC verifies current membership,
    // locks integration/config/credentials and preserves omitted fields inside one transaction.
    const { data, error } = await ctx.supabaseAdmin.rpc(
      "social_integration_secrets_mutate",
      {
        p_workspace: payload.workspaceId,
        p_user: user.id,
        p_channel: payload.channel,
        p_action: payload.action,
        ...incoming,
      } as never,
    );
    if (error) {
      const safe = safeDatabaseError(error);
      return badRequest(safe.code, safe.status);
    }
    return Response.json(data);
  }),
};

export default integrationSecretsFunction;
