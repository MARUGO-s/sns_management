import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const helperSource = await readFile(new URL("../app/lib/x-oauth.ts", import.meta.url), "utf8");
const helpers = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(helperSource)).toString("base64")}`);
const input = { appId: "  oauth-client  ", clientSecret: "", accessToken: "", refreshToken: "", webhookSecret: "", scopes: " tweet.read, users.read ", stored: { accessToken: false } };

test("X configuration is ready without manual tokens; other SNS still require a token", () => {
  assert.equal(helpers.integrationInputReady("x", input), true);
  assert.equal(helpers.integrationInputReady("x", { ...input, appId: " " }), false);
  for (const channel of ["instagram", "tiktok", "threads"]) {
    assert.equal(helpers.integrationInputReady(channel, input), false);
    assert.equal(helpers.integrationInputReady(channel, { ...input, accessToken: "new-token" }), true);
    assert.equal(helpers.integrationInputReady(channel, { ...input, stored: { accessToken: true } }), true);
    assert.equal(helpers.integrationInputReady(channel, { ...input, appId: "", accessToken: "new-token" }), false);
  }
});

test("X configure sends only whitelisted values and blank secrets preserve saved credentials", () => {
  assert.deepEqual(helpers.xOAuthConfigureBody("workspace", input), {
    action: "configure", workspaceId: "workspace", appId: "oauth-client", scopes: "tweet.read, users.read",
  });
  const body = helpers.xOAuthConfigureBody("workspace", { ...input, clientSecret: " new-secret ", accessToken: "manual-token", refreshToken: "manual-refresh", callbackUrl: "https://evil.test" });
  assert.equal(body.clientSecret, "new-secret");
  assert.equal("accessToken" in body, false);
  assert.equal("refreshToken" in body, false);
  assert.equal("callbackUrl" in body, false);
});

test("callback cleanup preserves Supabase auth parameters and fragment without trusting provider errors", () => {
  const result = helpers.parseXOAuthCallback("https://app.example/sns_management/?social_x_oauth=error&social_x_error=%3Cscript%3Esecret&code=login-code&error_description=auth-only#access_token=auth-only");
  assert.deepEqual(result.callback, { status: "error", error: "" });
  assert.equal(result.cleanedUrl, "/sns_management/?code=login-code&error_description=auth-only#access_token=auth-only");
  assert.equal(result.hasCallbackParams, true);
  assert.doesNotMatch(helpers.xOAuthCallbackMessage(result.callback), /script|secret|auth-only/);
  const known = helpers.parseXOAuthCallback("https://app.example/?social_x_oauth=denied&social_x_error=access_denied");
  assert.match(helpers.xOAuthCallbackMessage(known.callback), /キャンセル/);
  assert.equal(helpers.parseXOAuthCallback("https://app.example/?social_x_oauth=posted").callback, null);
  assert.equal(helpers.parseXOAuthCallback("https://app.example/?code=login-code#provider").hasCallbackParams, false);
  assert.doesNotMatch(helpers.xOAuthFailureMessage("constructor"), /function|Object/);
  assert.match(helpers.xOAuthCallbackMessage({ status: "success", error: "" }), /自動公開機能はまだ有効になりません/);
});

test("authorization URLs accept only exact HTTPS X OAuth endpoint", () => {
  assert.equal(helpers.safeXAuthorizationUrl("https://x.com/i/oauth2/authorize?state=abc"), "https://x.com/i/oauth2/authorize?state=abc");
  for (const malicious of [
    "https://x.com.evil.test/i/oauth2/authorize",
    "https://evil.test/i/oauth2/authorize",
    "http://x.com/i/oauth2/authorize",
    "https://x.com/i/oauth2/authorize/extra",
    "https://x.com/i/oauth2/authorize#secret",
    "https://user:pass@x.com/i/oauth2/authorize",
    "https://x.com:444/i/oauth2/authorize",
    "javascript:alert(1)", "/i/oauth2/authorize", null, { url: "https://x.com" },
  ]) assert.throws(() => helpers.safeXAuthorizationUrl(malicious), /invalid_authorization_url/);
});

test("callback URL is calculated from public backend origin; composer changes are protected", () => {
  assert.equal(helpers.getXOAuthCallbackUrl("https://backend.example/"), "https://backend.example/functions/v1/social-x-oauth-callback");
  assert.equal(helpers.getXOAuthCallbackUrl(undefined), "");
  assert.equal(helpers.getXOAuthCallbackUrl("not-a-url"), "");
  assert.equal(helpers.getXOAuthCallbackUrl("http://untrusted.example"), "");
  assert.equal(helpers.getXOAuthCallbackUrl("https://user:pass@backend.example"), "");
  assert.equal(helpers.getXOAuthCallbackUrl("https://backend.example/?key=private"), "");
  const empty = { postText: "", attachmentCount: 0, scheduledAt: "", channelCount: 0 };
  assert.equal(helpers.hasUnsavedComposer(empty), false);
  for (const changed of [{ postText: "draft" }, { attachmentCount: 1 }, { scheduledAt: "2026-10-06" }, { channelCount: 1 }]) {
    assert.equal(helpers.hasUnsavedComposer({ ...empty, ...changed }), true);
  }
});

test("only stored metadata plus verified OAuth account and token flags prove a connection", () => {
  assert.equal(helpers.isXOAuthConnected("configured", { connected: true, status: { accessToken: true } }), true);
  for (const result of [undefined, {}, { connected: true }, { connected: true, status: { accessToken: false } }, { connected: false, status: { accessToken: true } }, { connected: "true", status: { accessToken: true } }]) {
    assert.equal(helpers.isXOAuthConnected("configured", result), false);
  }
  assert.equal(helpers.isXOAuthConnected("needs_review", { connected: true, status: { accessToken: true } }), false);
  assert.equal(helpers.isXOAuthConnected("success", { connected: true, status: { accessToken: true } }), false);
});

/** Test-only initial-state injection renders the real production JSX. Effects never run during SSR.
 * The Supabase module is replaced with an inert object, so this harness cannot read or write a database.
 */
async function renderSettings(channel, saving = false, storedRefresh = false) {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false, appType: "custom", optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    plugins: [{
      name: "synthetic-authenticated-settings",
      enforce: "pre",
      transform(code, id) {
        if (id.endsWith("/app/lib/supabase.ts")) {
          return { code: "export const supabase = {}; export const googleAuthEnabled = false;", map: null };
        }
        if (!id.endsWith("/app/social-console.tsx")) return null;
        const replacements = [
          ['useState<ViewId>("compose")', 'useState<ViewId>("settings")'],
          ['useState<ChannelId>("instagram")', `useState<ChannelId>("${channel}")`],
          ['useState<User | null>(null)', 'useState<User | null>({ id: "test-user", email: "synthetic@example.test" } as User)'],
          ['useState(Boolean(supabase))', 'useState(false)'],
          ['const [savingIntegration, setSavingIntegration] = useState(false);', `const [savingIntegration, setSavingIntegration] = useState(${saving});`],
          ['getXOAuthCallbackUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)', 'getXOAuthCallbackUrl("https://synthetic-backend.example")'],
        ];
        for (const [from, to] of replacements) {
          assert.ok(code.includes(from), `Synthetic fixture anchor must exist: ${from}`);
          code = code.replace(from, to);
        }
        if (storedRefresh) code = code.replace('stored: { ...emptySecretFlags },', 'stored: { ...emptySecretFlags, refreshToken: true },');
        return { code, map: null };
      },
    }],
  });
  try {
    const { default: SocialConsole } = await server.ssrLoadModule("/app/social-console.tsx");
    const html = renderToStaticMarkup(createElement(SocialConsole));
    const settings = html.slice(html.indexOf('aria-label="SNS API連携設定"'));
    assert.ok(settings.includes("integration-editor-panel"), "Harness renders real settings, not a login placeholder");
    return settings;
  } finally { await server.close(); }
}

function buttonMarkup(html, label) {
  const button = (html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [])
    .find((candidate) => candidate.includes(`<span>${label}</span>`));
  assert.ok(button, `Button ${label} must exist`);
  return button;
}

test("real X settings render server-managed tokens and read-only callback without a webhook field", async () => {
  const html = await renderSettings("x");
  assert.match(html, /OAuth 2\.0 Client ID/);
  assert.match(html, /数値のApp ID/);
  assert.match(html, /server-managed-token/);
  assert.equal((html.match(/<input\b/g) ?? []).length, 3, "Only Client ID, Client Secret and read-only Callback URL have input fields");
  assert.doesNotMatch(html, /Webhook Secret/);
  assert.match(html, /readonly=""/i);
  assert.match(html, /value="https:\/\/synthetic-backend\.example\/functions\/v1\/social-x-oauth-callback"/);
  assert.match(html, /未公開・未設定/);
  assert.match(html, /Xに連携/);
  assert.match(buttonMarkup(html, "トークンを更新"), /disabled=""/);
  assert.doesNotMatch(buttonMarkup(html, "Xに連携"), /disabled/);
  assert.match(html, /アプリ設定を保存/);
});

test("other SNS keep manual access/refresh/webhook fields and existing save controls", async () => {
  for (const channel of ["instagram", "tiktok", "threads"]) {
    const html = await renderSettings(channel);
    assert.match(html, /Client ID \/ App ID/);
    assert.match(html, /Access Token/);
    assert.match(html, /Refresh Token/);
    assert.match(html, /Webhook Secret/);
    assert.match(html, /placeholder="必須"/);
    assert.match(html, /安全に登録/);
    assert.doesNotMatch(html, /server-managed-token|OAuth 2\.0 Client ID|Xに連携/);
  }
});

test("busy settings disable their entire input fieldset and refresh requires stored token", async () => {
  const busy = await renderSettings("x", true);
  assert.match(busy, /<fieldset[^>]*disabled=""/);
  const withRefresh = await renderSettings("x", false, true);
  assert.match(withRefresh, /保存済み・サーバー管理/);
  assert.doesNotMatch(buttonMarkup(withRefresh, "トークンを更新"), /disabled/);
});
