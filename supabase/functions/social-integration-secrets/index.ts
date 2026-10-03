import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

type ChannelId = "instagram" | "tiktok" | "x" | "threads";
type Action = "list" | "save" | "delete";

const channels: ChannelId[] = ["instagram", "tiktok", "x", "threads"];
const secretFields = [
  "client_secret",
  "access_token",
  "refresh_token",
  "webhook_secret",
] as const;

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
      secrets?: Partial<Record<"clientSecret" | "accessToken" | "refreshToken" | "webhookSecret", string>>;
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
          .select("integration_id, client_secret, access_token, refresh_token, webhook_secret")
          .in("integration_id", ids)
        : { data: [], error: null };

      if (secretsError) return badRequest(secretsError.message, 500);

      const byIntegration = new Map(
        (storedSecrets ?? []).map((item) => [item.integration_id, item]),
      );
      const status = Object.fromEntries(
        channels.map((channel) => {
          const integration = (integrations ?? []).find((item) => item.channel === channel);
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

    const { data: integration, error: integrationError } = await ctx.supabase
      .from("social_integrations")
      .select("id")
      .eq("workspace_id", payload.workspaceId)
      .eq("channel", payload.channel)
      .maybeSingle();

    if (integrationError) return badRequest(integrationError.message, 500);
    if (!integration) return badRequest("Integration not found", 404);

    if (payload.action === "delete") {
      const { error } = await ctx.supabaseAdmin
        .from("social_integration_secrets")
        .delete()
        .eq("integration_id", integration.id);

      if (error) return badRequest(error.message, 500);
      return Response.json({ ok: true });
    }

    if (payload.action !== "save") return badRequest("Unsupported action");

    const input = payload.secrets ?? {};
    const incoming = {
      client_secret: input.clientSecret?.trim() ?? "",
      access_token: input.accessToken?.trim() ?? "",
      refresh_token: input.refreshToken?.trim() ?? "",
      webhook_secret: input.webhookSecret?.trim() ?? "",
    };

    if (Object.values(incoming).some((value) => value.length > 65536)) {
      return badRequest("A credential is too large");
    }

    const { data: current, error: currentError } = await ctx.supabaseAdmin
      .from("social_integration_secrets")
      .select("client_secret, access_token, refresh_token, webhook_secret")
      .eq("integration_id", integration.id)
      .maybeSingle();

    if (currentError) return badRequest(currentError.message, 500);

    const merged = { integration_id: integration.id, updated_at: new Date().toISOString() } as
      Record<string, string>;
    for (const field of secretFields) {
      merged[field] = incoming[field] || current?.[field] || "";
    }

    const { error: saveError } = await ctx.supabaseAdmin
      .from("social_integration_secrets")
      .upsert(merged as never, { onConflict: "integration_id" });

    if (saveError) return badRequest(saveError.message, 500);

    return Response.json({
      ok: true,
      status: {
        clientSecret: Boolean(merged.client_secret),
        accessToken: Boolean(merged.access_token),
        refreshToken: Boolean(merged.refresh_token),
        webhookSecret: Boolean(merged.webhook_secret),
      },
    });
  }),
};

export default integrationSecretsFunction;
