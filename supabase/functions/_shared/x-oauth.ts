/** X OAuth protocol helpers. Never log provider responses, tokens, or callback URLs. */
export const SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access",
] as const;
export const APP_URL = "https://marugo-s.github.io/sns_management/";
export type OAuthConfiguration = {
  appId: string;
  clientSecret: string;
  scopes: string;
  verifier: string;
  integrationId: string;
  revision: string;
  version: number;
  refreshToken: string;
  accountId: string;
  accountUsername: string;
};
export type SafeError =
  | "invalid_request"
  | "invalid_state"
  | "forbidden"
  | "not_configured"
  | "not_connected"
  | "busy"
  | "provider_unavailable"
  | "authorization_failed"
  | "invalid_token"
  | "storage_failed";
export class OAuthError extends Error {
  constructor(public code: SafeError, public status = 400) {
    super(code);
  }
}
export function normalizeScopes(value: unknown): string {
  const list = typeof value === "string"
    ? value.split(/[\s,]+/).filter(Boolean)
    : [];
  if (list.some((s) => !SCOPES.includes(s as typeof SCOPES[number]))) {
    throw new OAuthError("invalid_request");
  }
  // All four are required for writing and durable offline refresh. An empty value selects defaults.
  if (list.length && SCOPES.some((s) => !list.includes(s))) {
    throw new OAuthError("invalid_request");
  }
  return SCOPES.join(" ");
}
export function callbackUrl(supabaseUrl: string): string {
  const url = new URL(supabaseUrl);
  if (
    url.username || url.password || url.search || url.hash ||
    (url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname))
  ) throw new OAuthError("invalid_request");
  return `${url.origin}/functions/v1/social-x-oauth-callback`;
}
export function resultUrl(
  result: "success" | "denied" | "error",
  error?: SafeError,
): string {
  const url = new URL(APP_URL);
  url.searchParams.set("social_x_oauth", result);
  if (error) url.searchParams.set("social_x_error", error);
  return url.href;
}
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll(
    "/",
    "_",
  ).replaceAll("=", "");
}
export function randomValue(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
export async function stateHash(state: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state)),
  );
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function challenge(verifier: string): Promise<string> {
  return base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
}
export async function authorizationUrl(
  appId: string,
  callback: string,
  state: string,
  verifier: string,
  scopes: string,
): Promise<string> {
  const url = new URL("https://x.com/i/oauth2/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: appId,
    redirect_uri: callback,
    state,
    code_challenge: await challenge(verifier),
    code_challenge_method: "S256",
    scope: normalizeScopes(scopes),
  }).toString();
  return url.href;
}
async function providerJson(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetcher(url, {
      ...init,
      signal: controller.signal,
      redirect: "error",
    });
    if (!res.ok) {
      throw new OAuthError(
        res.status === 429 || res.status >= 500
          ? "provider_unavailable"
          : "authorization_failed",
        502,
      );
    }
    // Streaming bound covers hostile/misconfigured providers without unbounded allocation.
    const reader = res.body?.getReader();
    if (!reader) throw new OAuthError("invalid_token", 502);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new OAuthError("invalid_token", 502);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) {
      bytes.set(part, offset);
      offset += part.length;
    }
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new OAuthError("invalid_token", 502);
    }
    return data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof OAuthError) throw error;
    throw new OAuthError("provider_unavailable", 502);
  } finally {
    clearTimeout(timer);
  }
}
export type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};
export async function exchangeToken(
  input: {
    appId: string;
    clientSecret: string;
    code?: string;
    verifier?: string;
    callback?: string;
    refreshToken?: string;
    scopes: string;
  },
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<Tokens> {
  const body = new URLSearchParams(
    input.refreshToken
      ? { grant_type: "refresh_token", refresh_token: input.refreshToken }
      : {
        grant_type: "authorization_code",
        code: input.code ?? "",
        code_verifier: input.verifier ?? "",
        redirect_uri: input.callback ?? "",
      },
  );
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
  };
  if (input.clientSecret) {
    headers.Authorization = `Basic ${
      btoa(
        `${encodeURIComponent(input.appId)}:${
          encodeURIComponent(input.clientSecret)
        }`,
      )
    }`;
  } else body.set("client_id", input.appId);
  const data = await providerJson("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body,
  }, fetcher);
  const access = data.access_token;
  const refresh = data.refresh_token ?? input.refreshToken;
  const seconds = data.expires_in;
  if (
    typeof access !== "string" || !access || access.length > 16384 ||
    typeof refresh !== "string" || !refresh || refresh.length > 16384 ||
    data.token_type !== "bearer" && data.token_type !== "Bearer" ||
    typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0 ||
    seconds > 31536000
  ) throw new OAuthError("invalid_token", 502);
  if (typeof data.scope !== "string" || !data.scope.trim()) {
    throw new OAuthError("invalid_token", 502);
  }
  try {
    normalizeScopes(data.scope);
  } catch {
    throw new OAuthError("invalid_token", 502);
  }
  return {
    accessToken: access,
    refreshToken: refresh,
    expiresAt: new Date(now + seconds * 1000).toISOString(),
  };
}
export async function verifyIdentity(
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<{ id: string; username: string }> {
  const body = await providerJson("https://api.x.com/2/users/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  }, fetcher);
  const data = body.data as Record<string, unknown> | undefined;
  if (
    !data || typeof data.id !== "string" || !/^\d{1,30}$/.test(data.id) ||
    typeof data.username !== "string" ||
    !/^[A-Za-z0-9_]{1,50}$/.test(data.username)
  ) throw new OAuthError("invalid_token", 502);
  return { id: data.id, username: data.username };
}
export function safeDatabaseError(error: unknown): OAuthError {
  const message = (error as { message?: string })?.message;
  const allowed: SafeError[] = [
    "invalid_state",
    "forbidden",
    "not_configured",
    "not_connected",
    "busy",
    "invalid_token",
  ];
  return new OAuthError(
    allowed.includes(message as SafeError)
      ? message as SafeError
      : "storage_failed",
    message === "forbidden" ? 403 : message === "busy" ? 409 : 400,
  );
}
