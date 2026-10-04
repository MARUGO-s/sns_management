import {
  exchangeToken,
  type OAuthConfiguration,
  OAuthError,
} from "./x-oauth.ts";
/** Refresh is bound to an already-verified account and immutable client revision by the SQL lease.
 * Re-reading users/me after rotation adds a failure point that can discard the new refresh token.
 * A refresh grant cannot select a different user, so preserve the verified identity from that lease.
 */
export async function refreshVerifiedConnection(
  config: OAuthConfiguration,
  userId: string,
  lease: string,
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  fetcher: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<void> {
  if (
    !/^\d{1,30}$/.test(config.accountId) ||
    !/^[A-Za-z0-9_]{1,50}$/.test(config.accountUsername)
  ) throw new OAuthError("not_connected");
  const tokens = await exchangeToken({
    ...config,
    refreshToken: config.refreshToken,
  }, fetcher);
  const commit = {
    p_integration: config.integrationId,
    p_user: userId,
    p_lease: lease,
    p_revision: config.revision,
    p_version: config.version,
    p_access: tokens.accessToken,
    p_refresh: tokens.refreshToken,
    p_expires: tokens.expiresAt,
    p_account_id: config.accountId,
    p_username: config.accountUsername,
  };
  // Never retry the rotating provider request. Retry only the identical DB commit; SQL
  // recognizes its receipt if the first commit succeeded but its response was lost.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (await rpc("social_x_oauth_refresh_finish", commit) !== true) {
        throw new OAuthError("storage_failed", 503);
      }
      return;
    } catch (error) {
      const safe = error instanceof OAuthError
        ? error
        : new OAuthError("storage_failed", 503);
      if (safe.code !== "storage_failed" || attempt === 2) throw safe;
      await pause(100 * (attempt + 1));
    }
  }
}
