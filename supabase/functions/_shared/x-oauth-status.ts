/** Safe response projection. Never include token values or internal revisions in browser output. */
export type StatusIntegration = { app_id: string; status: string };
export type StatusConfig = {
  revision: string;
  token_revision: string | null;
  expires_at: string | null;
  account_id: string | null;
  account_username: string | null;
};
export type StatusSecrets = {
  client_secret: string;
  access_token: string;
  refresh_token: string;
  webhook_secret: string;
};
export function safeOAuthStatus(
  integration: StatusIntegration | null,
  config: StatusConfig | null,
  secrets: StatusSecrets | null,
  callbackUrl: string,
  now = Date.now(),
) {
  const credentials = {
    clientSecret: Boolean(secrets?.client_secret),
    accessToken: Boolean(secrets?.access_token),
    refreshToken: Boolean(secrets?.refresh_token),
    webhookSecret: Boolean(secrets?.webhook_secret),
  };
  const current = Boolean(
    integration?.status === "configured" && config?.account_id &&
      config.token_revision && config.token_revision === config.revision,
  );
  const expiry = config?.expires_at ? Date.parse(config.expires_at) : NaN;
  const unexpired = Number.isFinite(expiry) && expiry > now;
  return {
    callbackUrl,
    configured: Boolean(integration?.app_id && config),
    connected: Boolean(current && credentials.accessToken && unexpired),
    needsRefresh: Boolean(
      current && credentials.accessToken && !unexpired &&
        credentials.refreshToken,
    ),
    needsReview: Boolean(
      (credentials.accessToken || credentials.refreshToken) && !current,
    ),
    expiresAt: current ? config?.expires_at ?? null : null,
    account: current && config?.account_id
      ? { id: config.account_id, username: config.account_username }
      : null,
    status: credentials,
  };
}
