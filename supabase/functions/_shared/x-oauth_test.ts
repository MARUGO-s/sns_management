import {
  authorizationUrl,
  callbackUrl,
  challenge,
  exchangeToken,
  normalizeScopes,
  OAuthError,
  randomValue,
  resultUrl,
  safeDatabaseError,
  stateHash,
  verifyIdentity,
} from "./x-oauth.ts";
import { isActualWorkspaceMember } from "./x-oauth-membership.ts";
function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
async function rejects(fn: () => unknown, code: string) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof OAuthError && error.code === code);
    return;
  }
  throw new Error(`expected ${code}`);
}
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}
const tokens = {
  access_token: "mock-access",
  refresh_token: "mock-rotated-refresh",
  token_type: "bearer",
  expires_in: 7200,
  scope: "tweet.read tweet.write users.read offline.access",
};
Deno.test("PKCE S256 matches RFC7636 known challenge and high entropy nonce", async () => {
  assert(
    await challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") ===
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
  const nonce = randomValue();
  assert(/^[\w-]{43}$/.test(nonce));
  assert(nonce !== randomValue());
  assert(/^[a-f0-9]{64}$/.test(await stateHash(nonce)));
});
Deno.test("authorization URL pins provider and callback, strict scope allowlist", async () => {
  const url = new URL(
    await authorizationUrl(
      "client",
      "https://backend.example/functions/v1/social-x-oauth-callback",
      "nonce",
      "verifier",
      normalizeScopes(""),
    ),
  );
  assert(url.origin === "https://x.com");
  assert(url.searchParams.get("code_challenge_method") === "S256");
  assert(
    url.searchParams.get("scope") ===
      "tweet.read tweet.write users.read offline.access",
  );
  await rejects(
    () => normalizeScopes("tweet.read users.read offline.access"),
    "invalid_request",
  );
  await rejects(
    () =>
      normalizeScopes(
        "tweet.read tweet.write users.read offline.access dm.write",
      ),
    "invalid_request",
  );
  assert(
    callbackUrl("https://backend.example") ===
      "https://backend.example/functions/v1/social-x-oauth-callback",
  );
  await rejects(
    () => callbackUrl("http://untrusted.example"),
    "invalid_request",
  );
});
Deno.test("callback result never contains code, state, provider error or token", () => {
  const url = new URL(resultUrl("error", "authorization_failed"));
  assert(url.href.startsWith("https://marugo-s.github.io/sns_management/"));
  assert(
    [...url.searchParams.keys()].join(",") === "social_x_oauth,social_x_error",
  );
  assert(
    safeDatabaseError({ message: "arbitrary backend secret" }).code ===
      "storage_failed",
  );
});
Deno.test("confidential code exchange uses Basic and fixed protocol fields", async () => {
  const fake: typeof fetch = async (url, init) => {
    assert(url === "https://api.x.com/2/oauth2/token");
    const headers = init?.headers as Record<string, string>;
    assert(headers.Authorization === "Basic " + btoa("client:mock-secret"));
    const body = init?.body as URLSearchParams;
    assert(body.get("code_verifier") === "verifier");
    assert(!body.has("client_id"));
    assert(init?.redirect === "error");
    return response(tokens);
  };
  const result = await exchangeToken(
    {
      appId: "client",
      clientSecret: "mock-secret",
      code: "code",
      verifier: "verifier",
      callback: "https://backend.example/cb",
      scopes: normalizeScopes(""),
    },
    fake,
    0,
  );
  assert(result.refreshToken === "mock-rotated-refresh");
  assert(result.expiresAt === "1970-01-01T02:00:00.000Z");
});
Deno.test("public refresh supplies client_id and retains refresh token if not rotated", async () => {
  const fake: typeof fetch = async (_url, init) => {
    const body = init?.body as URLSearchParams;
    assert(body.get("client_id") === "public-client");
    assert(body.get("grant_type") === "refresh_token");
    return response({ ...tokens, refresh_token: undefined });
  };
  const result = await exchangeToken({
    appId: "public-client",
    clientSecret: "",
    refreshToken: "mock-current",
    scopes: normalizeScopes(""),
  }, fake);
  assert(result.refreshToken === "mock-current");
});
Deno.test("provider errors never expose bodies and enforce bounds/expiry/scopes", async () => {
  const input = {
    appId: "id",
    clientSecret: "",
    code: "code",
    scopes: normalizeScopes(""),
  };
  await rejects(
    () =>
      exchangeToken(
        input,
        async () => response({ secret: "do not expose" }, 401),
      ),
    "authorization_failed",
  );
  await rejects(
    () =>
      exchangeToken(
        input,
        async () => response({ secret: "do not expose" }, 429),
      ),
    "provider_unavailable",
  );
  for (
    const patch of [
      { expires_in: 0 },
      { expires_in: "7200" },
      { scope: "tweet.read" },
      { refresh_token: "" },
      { token_type: "other" },
      { access_token: "" },
    ]
  ) {
    await rejects(
      () => exchangeToken(input, async () => response({ ...tokens, ...patch })),
      "invalid_token",
    );
  }
  await rejects(
    () => exchangeToken(input, async () => new Response("x".repeat(65537))),
    "invalid_token",
  );
  await rejects(() =>
    exchangeToken(input, async () => {
      throw new Error("mock network secret");
    }), "provider_unavailable");
});
Deno.test("users/me verifies safe identity only", async () => {
  const result = await verifyIdentity("mock-access", async (url, init) => {
    assert(url === "https://api.x.com/2/users/me");
    assert(
      (init?.headers as Record<string, string>).Authorization ===
        "Bearer mock-access",
    );
    return response({
      data: { id: "1234", username: "pingus0428", name: "not returned" },
    });
  });
  assert(result.id === "1234" && Object.keys(result).length === 2);
  await rejects(
    () =>
      verifyIdentity(
        "mock-access",
        async () => response({ data: { id: "oops", username: "name" } }),
      ),
    "invalid_token",
  );
});
function membershipClient(owner: string, member: boolean, error = false) {
  return {
    from(name: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return name === "social_workspaces"
            ? { data: { created_by: owner }, error: error ? {} : null }
            : { data: member ? { user_id: "user" } : null, error: null };
        },
      };
    },
  };
}
Deno.test("owner/member mutation grant is independent of admin SELECT visibility", async () => {
  assert(
    await isActualWorkspaceMember(
      membershipClient("user", false),
      "workspace",
      "user",
    ),
  );
  assert(
    await isActualWorkspaceMember(
      membershipClient("other", true),
      "workspace",
      "user",
    ),
  );
  assert(
    !await isActualWorkspaceMember(
      membershipClient("other", false),
      "workspace",
      "user",
    ),
  );
  assert(
    !await isActualWorkspaceMember(
      membershipClient("user", true, true),
      "workspace",
      "user",
    ),
  );
});

import { handleOAuthCallback } from "./x-oauth-callback-handler.ts";
const state = "a".repeat(43);
const callbackRequest = (query: string, method = "GET") =>
  new Request(
    `https://backend.example/functions/v1/social-x-oauth-callback?${query}`,
    { method },
  );
Deno.test("callback success commits token/verified identity only server-side, redirects without credentials", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const res = await handleOAuthCallback(
    callbackRequest(`state=${state}&code=mock-code`),
    {
      supabaseUrl: "https://backend.example",
      rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === "social_x_oauth_claim") {
          return {
            appId: "client",
            clientSecret: "mock-secret",
            verifier: "verifier",
            scopes: normalizeScopes(""),
          };
        }
        return true;
      },
      fetcher: async (url) =>
        String(url).endsWith("/token")
          ? response(tokens)
          : response({ data: { id: "1234", username: "pingus0428" } }),
    },
  );
  assert(res.status === 303);
  assert(res.headers.get("Location") === resultUrl("success"));
  assert(await res.text() === "");
  assert(res.headers.get("Referrer-Policy") === "no-referrer");
  const commit = calls.find((c) => c.name === "social_x_oauth_finish");
  assert(commit?.args.p_access === "mock-access");
  assert(commit.args.p_account_id === "1234");
  assert(calls.at(-1)?.name === "social_x_oauth_cancel");
});
Deno.test("invalid/replayed state and wrong method never call provider or commit", async () => {
  let providerCalls = 0, rpcCalls = 0;
  const deps = {
    supabaseUrl: "https://backend.example",
    rpc: async () => {
      rpcCalls++;
      throw new OAuthError("invalid_state");
    },
    fetcher: async () => {
      providerCalls++;
      return response(tokens);
    },
  };
  assert(
    (await handleOAuthCallback(
      callbackRequest(`state=${state}&code=x`, "POST"),
      deps,
    )).status === 405,
  );
  assert(rpcCalls === 0);
  for (
    const query of [
      "code=x",
      `state=${state}&state=${state}&code=x`,
      `state=${state}&code=x`,
    ]
  ) {
    const res = await handleOAuthCallback(callbackRequest(query), deps);
    assert(res.headers.get("Location") === resultUrl("error", "invalid_state"));
  }
  assert(providerCalls === 0);
});
Deno.test("denial consumes state, closes claim and never changes working tokens", async () => {
  const calls: string[] = [];
  const res = await handleOAuthCallback(
    callbackRequest(
      `state=${state}&error=access_denied&error_description=secret`,
    ),
    {
      supabaseUrl: "https://backend.example",
      rpc: async (name) => {
        calls.push(name);
        return {};
      },
      fetcher: async () => {
        throw new Error("must not call provider");
      },
    },
  );
  assert(res.headers.get("Location") === resultUrl("denied"));
  assert(calls.join(",") === "social_x_oauth_claim,social_x_oauth_cancel");
});
Deno.test("provider failure and commit race preserve tokens, do not leak provider body", async () => {
  for (const failCommit of [false, true]) {
    const calls: string[] = [];
    const res = await handleOAuthCallback(
      callbackRequest(`state=${state}&code=mock-code`),
      {
        supabaseUrl: "https://backend.example",
        rpc: async (name) => {
          calls.push(name);
          if (name === "social_x_oauth_claim") {
            return {
              appId: "client",
              clientSecret: "",
              verifier: "verifier",
              scopes: normalizeScopes(""),
            };
          }
          if (name === "social_x_oauth_finish") {
            throw new OAuthError("invalid_state");
          }
          return true;
        },
        fetcher: async (url) =>
          !failCommit
            ? response({ error: "mock-secret" }, 401)
            : String(url).endsWith("/token")
            ? response(tokens)
            : response({ data: { id: "1234", username: "pingus0428" } }),
      },
    );
    assert(
      res.headers.get("Location") ===
        resultUrl(
          "error",
          failCommit ? "invalid_state" : "authorization_failed",
        ),
    );
    assert(calls.at(-1) === "social_x_oauth_cancel");
    if (!failCommit) assert(!calls.includes("social_x_oauth_finish"));
  }
});

import { safeOAuthStatus } from "./x-oauth-status.ts";
import { refreshVerifiedConnection } from "./x-oauth-refresh-handler.ts";
const statusConfig = {
  revision: "current-config",
  token_revision: "current-config",
  expires_at: "2026-10-04T12:00:00.000Z",
  account_id: "1234",
  account_username: "pingus0428",
};
const statusSecrets = {
  client_secret: "mock-secret",
  access_token: "mock-access",
  refresh_token: "mock-refresh",
  webhook_secret: "",
};
Deno.test("safe status distinguishes connected, expired-needs-refresh and stale-needs-review without exposing tokens", () => {
  const current = safeOAuthStatus(
    { app_id: "client", status: "configured" },
    statusConfig,
    statusSecrets,
    "https://backend.example/callback",
    Date.parse("2026-10-04T11:59:00Z"),
  );
  assert(
    current.connected && !current.needsRefresh && !current.needsReview &&
      current.account?.id === "1234",
  );
  const expired = safeOAuthStatus(
    { app_id: "client", status: "configured" },
    statusConfig,
    statusSecrets,
    "https://backend.example/callback",
    Date.parse("2026-10-04T12:00:00Z"),
  );
  assert(
    !expired.connected && expired.needsRefresh && !expired.needsReview &&
      expired.status.refreshToken,
  );
  const changed = safeOAuthStatus(
    { app_id: "different-client", status: "needs_review" },
    { ...statusConfig, revision: "different-config" },
    statusSecrets,
    "https://backend.example/callback",
    0,
  );
  assert(
    !changed.connected && !changed.needsRefresh && changed.needsReview &&
      changed.account === null,
  );
  assert(changed.status.accessToken && changed.status.refreshToken);
  // Forging public integration status cannot make an old-config token current.
  const forged = safeOAuthStatus(
    { app_id: "different-client", status: "configured" },
    { ...statusConfig, revision: "different-config" },
    statusSecrets,
    "https://backend.example/callback",
    0,
  );
  assert(!forged.connected && forged.needsReview);
  for (const item of [current, expired, changed, forged]) {
    assert(
      !JSON.stringify(item).includes("mock-access") &&
        !JSON.stringify(item).includes("mock-secret") &&
        !JSON.stringify(item).includes("current-config"),
    );
  }
});
Deno.test("refresh commits rotated credentials with verified lease identity and never re-fetches users/me", async () => {
  let fetchCalls = 0;
  const commits: { name: string; args: Record<string, unknown> }[] = [];
  await refreshVerifiedConnection(
    {
      appId: "client",
      clientSecret: "mock-secret",
      scopes: normalizeScopes(""),
      verifier: "",
      integrationId: "integration",
      revision: "config-revision",
      version: 7,
      refreshToken: "mock-old-refresh",
      accountId: "1234",
      accountUsername: "pingus0428",
    },
    "user",
    "lease",
    async (name, args) => {
      commits.push({ name, args });
      return true;
    },
    async (url) => {
      fetchCalls++;
      assert(
        url === "https://api.x.com/2/oauth2/token",
        "users/me must not be a post-rotation failure point",
      );
      return response(tokens);
    },
  );
  assert(fetchCalls === 1 && commits.length === 1);
  const commit = commits[0];
  assert(commit.name === "social_x_oauth_refresh_finish");
  assert(
    commit.args.p_refresh === "mock-rotated-refresh" &&
      commit.args.p_account_id === "1234" &&
      commit.args.p_username === "pingus0428" &&
      commit.args.p_revision === "config-revision" &&
      commit.args.p_version === 7,
  );
});

const refreshFixture = {
  appId: "client",
  clientSecret: "",
  scopes: normalizeScopes(""),
  verifier: "",
  integrationId: "integration",
  revision: "config-revision",
  version: 7,
  refreshToken: "mock-old-refresh",
  accountId: "1234",
  accountUsername: "pingus0428",
};
Deno.test("refresh retries only identical persistence payload after lost commit response, not the provider rotation", async () => {
  let providerCalls = 0, attempts = 0;
  const payloads: string[] = [];
  await refreshVerifiedConnection(
    refreshFixture,
    "user",
    "lease",
    async (name, args) => {
      assert(name === "social_x_oauth_refresh_finish");
      payloads.push(JSON.stringify(args));
      attempts++;
      if (attempts === 1) throw new OAuthError("storage_failed", 503);
      return true;
    },
    async () => {
      providerCalls++;
      return response(tokens);
    },
    async () => {},
  );
  assert(providerCalls === 1 && attempts === 2 && payloads[0] === payloads[1]);
});
Deno.test("refresh persistence retries are bounded and definitive CAS errors are not retried", async () => {
  for (const code of ["storage_failed", "invalid_state"] as const) {
    let providerCalls = 0, attempts = 0;
    await rejects(
      () =>
        refreshVerifiedConnection(refreshFixture, "user", "lease", async () => {
          attempts++;
          throw new OAuthError(code);
        }, async () => {
          providerCalls++;
          return response(tokens);
        }, async () => {}),
      code,
    );
    assert(
      providerCalls === 1 && attempts === (code === "storage_failed" ? 3 : 1),
    );
  }
});
