import {
  callbackUrl,
  exchangeToken,
  type OAuthConfiguration,
  OAuthError,
  resultUrl,
  stateHash,
  verifyIdentity,
} from "./x-oauth.ts";
export type CallbackDependencies = {
  supabaseUrl: string;
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  fetcher?: typeof fetch;
};
/** Dependencies are injected for provider-mocked HTTP tests. RPC is a server-only client. */
export async function handleOAuthCallback(
  req: Request,
  deps: CallbackDependencies,
): Promise<Response> {
  if (req.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET", "Cache-Control": "no-store" },
    });
  }
  const redirect = (
    result: "success" | "denied" | "error",
    error?: OAuthError,
  ) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: resultUrl(result, error?.code),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  let claimedHash: string | null = null;
  try {
    const url = new URL(req.url);
    const state = url.searchParams.get("state");
    if (
      !state || !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      url.searchParams.getAll("state").length !== 1
    ) throw new OAuthError("invalid_state");
    const hash = await stateHash(state);
    // Even denial consumes valid state. Replays can never call the token endpoint.
    const config = await deps.rpc("social_x_oauth_claim", {
      p_hash: hash,
    }) as OAuthConfiguration;
    claimedHash = hash;
    if (url.searchParams.has("error")) return redirect("denied");
    const code = url.searchParams.get("code");
    if (
      !code || code.length > 2048 ||
      url.searchParams.getAll("code").length !== 1
    ) throw new OAuthError("invalid_request");
    const tokens = await exchangeToken({
      ...config,
      code,
      callback: callbackUrl(deps.supabaseUrl),
    }, deps.fetcher);
    const identity = await verifyIdentity(tokens.accessToken, deps.fetcher);
    await deps.rpc("social_x_oauth_finish", {
      p_hash: hash,
      p_access: tokens.accessToken,
      p_refresh: tokens.refreshToken,
      p_expires: tokens.expiresAt,
      p_account_id: identity.id,
      p_username: identity.username,
    });
    return redirect("success");
  } catch (error) {
    return redirect(
      "error",
      error instanceof OAuthError
        ? error
        : new OAuthError("storage_failed", 500),
    );
  } finally {
    // Close failed/denied claims too, without changing working tokens or making the nonce reusable.
    if (claimedHash) {
      await deps.rpc("social_x_oauth_cancel", { p_hash: claimedHash }).catch(
        () => undefined,
      );
    }
  }
}
