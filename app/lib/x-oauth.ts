export type XOAuthCallback = {
  status: "success" | "denied" | "error";
  error: string;
};

const xOAuthErrors: Record<string, string> = {
  invalid_request: "Client IDとScopesの入力を確認してください。基本権限はtweet.read、tweet.write、users.read、offline.accessです。画像・動画にはmedia.writeも必要です。",
  forbidden: "このワークスペースのX連携を変更する権限がありません。",
  not_connected: "Xの許可がまだ完了していません。「Xに連携」から許可してください。",
  busy: "X連携の別の処理が実行中です。少し待ってからもう一度お試しください。",
  provider_unavailable: "Xの認可サービスに接続できませんでした。少し待ってからもう一度お試しください。",
  authorization_failed: "Xの認可を完了できませんでした。開発者アプリのClient ID・Client Secret・Callback URLを確認してください。",
  invalid_token: "Xの認可情報を確認できませんでした。Xに再連携してください。",
  storage_failed: "Xの連携情報を保存・確認できませんでした。連携サーバーの設定を確認してください。",
  access_denied: "Xの連携許可がキャンセルされました。",
  invalid_state: "認可の有効期限が切れたか、認可情報を確認できませんでした。もう一度連携してください。",
  state_expired: "認可の有効期限が切れました。もう一度連携してください。",
  expired_state: "認可の有効期限が切れました。もう一度連携してください。",
  token_exchange_failed: "Xの認可情報を保存できませんでした。もう一度連携してください。",
  configuration_missing: "X連携のサーバー設定が未完了です。管理者による設定が必要です。",
  not_configured: "X連携のサーバー設定が未完了です。管理者による設定が必要です。",
  app_not_configured: "OAuth 2.0 Client IDとClient Secretを保存してください。",
  refresh_token_missing: "更新用トークンがありません。Xに再連携してください。",
  refresh_failed: "Xのトークンを更新できませんでした。Xに再連携してください。",
  scope_not_allowed: "Scopesを確認してください。このアプリで利用できる権限だけを指定してください。",
};

/** Only locally constructed, safe UI messages may pass through an action's error handler. */
export class XOAuthUiError extends Error {}

/** Only these two names belong to X OAuth. Supabase login parameters and hash stay intact. */
export function parseXOAuthCallback(href: string): {
  callback: XOAuthCallback | null;
  cleanedUrl: string;
  hasCallbackParams: boolean;
} {
  const url = new URL(href);
  const status = url.searchParams.get("social_x_oauth");
  const error = url.searchParams.get("social_x_error") ?? "";
  const hasCallbackParams =
    url.searchParams.has("social_x_oauth") ||
    url.searchParams.has("social_x_error");
  url.searchParams.delete("social_x_oauth");
  url.searchParams.delete("social_x_error");
  return {
    callback: status === "success" || status === "denied" || status === "error"
      ? { status, error: Object.hasOwn(xOAuthErrors, error) ? error : "" }
      : null,
    cleanedUrl: `${url.pathname}${url.search}${url.hash}`,
    hasCallbackParams,
  };
}

export function xOAuthCallbackMessage(callback: XOAuthCallback) {
  if (callback.status === "success") {
    return "Xの連携許可が完了しました。手動投稿は確認画面から実行できます。予約の自動公開は未実装です。";
  }
  if (callback.status === "denied") return xOAuthErrors.access_denied;
  return xOAuthFailureMessage(callback.error);
}

export function xOAuthFailureMessage(code: unknown) {
  return typeof code === "string" && Object.hasOwn(xOAuthErrors, code)
    ? xOAuthErrors[code]
    : "X連携を完了できませんでした。連携用サーバーが公開・設定済みか確認し、もう一度お試しください。";
}

export function getXOAuthCallbackUrl(supabaseUrl: string | undefined) {
  if (!supabaseUrl) return "";
  try {
    const url = new URL(supabaseUrl);
    if (url.username || url.password || url.search || url.hash) return "";
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return "";
    }
    return `${url.origin}/functions/v1/social-x-oauth-callback`;
  } catch {
    return "";
  }
}

/** Never navigate to a URL returned by a server unless it is the exact X authorization endpoint. */
export function safeXAuthorizationUrl(value: unknown) {
  if (typeof value !== "string") throw new Error("invalid_authorization_url");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid_authorization_url");
  }
  if (
    url.origin !== "https://x.com" ||
    url.pathname !== "/i/oauth2/authorize" ||
    url.username ||
    url.password ||
    url.hash
  ) throw new Error("invalid_authorization_url");
  return url.toString();
}

export type IntegrationInput = {
  appId: string;
  clientSecret: string;
  scopes: string;
  accessToken: string;
  stored: { accessToken: boolean };
};

/** X authorization obtains tokens on the server; other integrations retain manual token requirements. */
export function integrationInputReady(channel: string, input: IntegrationInput) {
  return Boolean(input.appId.trim()) &&
    (channel === "x" || Boolean(input.accessToken.trim()) || input.stored.accessToken);
}

/** Explicit whitelist prevents manual tokens or callback fields entering the OAuth configuration request. */
export function xOAuthConfigureBody(workspaceId: string, input: IntegrationInput) {
  return {
    action: "configure",
    workspaceId,
    appId: input.appId.trim(),
    ...(input.clientSecret.trim() ? { clientSecret: input.clientSecret.trim() } : {}),
    scopes: input.scopes.trim(),
  };
}

export function hasUnsavedComposer(input: {
  postText: string;
  attachmentCount: number;
  scheduledAt: string;
  channelCount: number;
}) {
  return Boolean(input.postText.trim() || input.attachmentCount || input.scheduledAt || input.channelCount);
}

/** Neither a success query parameter nor a legacy manual token proves an authorized X account. */
export function isXOAuthConnected(metadataStatus: unknown, result: {
  connected?: unknown;
  status?: { accessToken?: unknown };
} | null | undefined) {
  return metadataStatus === "configured" &&
    result?.connected === true &&
    result.status?.accessToken === true;
}
