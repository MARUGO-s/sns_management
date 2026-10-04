import twitterText from "twitter-text";

export type XPublicationState = "preparing" | "sending" | "published" | "rejected" | "unknown";
export type XPublicationAttempt = {
  id: string;
  post_id: string;
  workspace_id: string;
  request_id: string;
  state: XPublicationState;
  remote_post_id: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
};
export type XPublishResult = {
  state: XPublicationState;
  attemptId: string;
  requestId: string;
  remotePostId?: string;
  errorCode?: string;
  nextCheckAt?: string;
};
export type XMediaInput = { id: string; name: string; type: string; size: number };
export type XExpectedFile = {
  id: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};
export type XPublishExpected = {
  body: string;
  files: XExpectedFile[];
  connectionFingerprint: string;
};

export const xAttemptProjection =
  "id,post_id,workspace_id,request_id,state,remote_post_id,error_code,created_at,updated_at";
export const xImageLimit = 5 * 1024 * 1024;
export const xVideoLimit = 20 * 1024 * 1024;
const states: XPublicationState[] = ["preparing", "sending", "published", "rejected", "unknown"];
// Keep in sync with the Function's public error projection. The proof flag is
// issued only for a known rollback of its initial preparation transaction.
const xPublicFailureCodes = new Set([
  "invalid_request", "forbidden", "not_connected", "not_configured", "busy",
  "stale_snapshot", "unsupported_media", "publication_locked", "already_published",
  "media_expired", "storage_failed", "invalid_text", "media_too_large",
  "invalid_media", "media_failed", "provider_unavailable", "authorization_failed",
  "invalid_token", "rate_limited", "provider_rejected", "unknown_result",
  "invalid_state", "media_permission_required",
]);

export function validateXPost(text: string, files: XMediaInput[]) {
  const normalizedText = text.trim().normalize("NFC");
  const parsed = twitterText.parseTweet(normalizedText);
  let error = "";
  if (!normalizedText) error = "Xへの投稿本文を入力してください。";
  else if (!parsed.valid) error = "Xの本文は加重文字数280以内で入力してください。";
  else if (files.length > 4) error = "Xには画像4枚まで、またはMP4動画1本を添付できます。";
  else if (files.some((file) => !["image/jpeg", "image/png", "video/mp4"].includes(file.type))) {
    error = "Xの添付はJPEG・PNG画像またはMP4動画に限ります。";
  } else if (files.some((file) => !Number.isSafeInteger(file.size) || file.size <= 0)) {
    error = "空の添付ファイルは送信できません。";
  } else if (files.some((file) => file.size > (file.type === "video/mp4" ? xVideoLimit : xImageLimit))) {
    error = "Xの画像は1枚5MiB、MP4動画は20MiBまでです。";
  } else if (files.some((file) => file.type === "video/mp4") && files.length !== 1) {
    error = "Xの動画は1本のみです。画像や別の動画と同時には送れません。";
  }
  return { text: normalizedText, weightedLength: parsed.weightedLength, valid: !error, error };
}

export function xAttemptLocksPost(attempt?: XPublicationAttempt | null) {
  return Boolean(attempt && attempt.state !== "rejected");
}

/** A read-only not_started status or transport failure is not this proof. */
export function parseXNotStartedFailure(value: unknown, expectedRequestId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.notStarted !== true || typeof data.requestId !== "string" ||
      data.requestId !== expectedRequestId || !expectedRequestId ||
      typeof data.error !== "string" || !xPublicFailureCodes.has(data.error) ||
      Object.keys(data).some((key) => !["error", "notStarted", "requestId"].includes(key))) return null;
  return { error: data.error, requestId: data.requestId };
}

export function removeXPendingRequest(
  pending: Array<{ postId: string; requestId: string }>,
  postId: string,
  requestId: string,
) {
  return pending.filter((item) => item.postId !== postId || item.requestId !== requestId);
}

export function removeXOptimisticAttempt(
  attempts: Record<string, XPublicationAttempt>,
  postId: string,
  requestId: string,
) {
  const attempt = attempts[postId];
  if (!attempt || attempt.request_id !== requestId || attempt.state !== "unknown" || attempt.id) return attempts;
  const next = { ...attempts };
  delete next[postId];
  return next;
}

/** Rows must be newest-first. A previous rejection cannot resolve a new lost response. */
export function reconcileXAttempts(
  rows: XPublicationAttempt[],
  pending: Array<{ postId: string; requestId: string }>,
  workspaceId: string,
  now = Date.now(),
) {
  const next: Record<string, XPublicationAttempt> = {};
  const byRequest = new Map<string, XPublicationAttempt>();
  for (const storedRow of rows) {
    if (storedRow.workspace_id !== workspaceId) continue;
    const row = storedRow.state === "sending" && Number.isFinite(Date.parse(storedRow.updated_at)) &&
        now - Date.parse(storedRow.updated_at) > 120000
      ? { ...storedRow, state: "unknown" as const, error_code: "unknown_result" } : storedRow;
    if (!next[row.post_id]) next[row.post_id] = row;
    byRequest.set(`${row.post_id}/${row.request_id}`, row);
  }
  for (const item of pending) {
    const matching = byRequest.get(`${item.postId}/${item.requestId}`);
    if (next[item.postId]?.state === "published") continue;
    if (matching) {
      next[item.postId] = matching;
    } else {
      next[item.postId] = {
        id: "", post_id: item.postId, workspace_id: workspaceId, request_id: item.requestId,
        state: "unknown", remote_post_id: null, error_code: null, created_at: "", updated_at: "",
      };
    }
  }
  return next;
}

export function xPostLink(id?: string | null) {
  return typeof id === "string" && /^[1-9][0-9]{0,24}$/.test(id)
    ? `https://x.com/i/web/status/${id}` : null;
}

export function parseXPublishResult(value: unknown): XPublishResult | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (!states.includes(data.state as XPublicationState) ||
      typeof data.attemptId !== "string" || typeof data.requestId !== "string") return null;
  return {
    state: data.state as XPublicationState,
    attemptId: data.attemptId,
    requestId: data.requestId,
    ...(typeof data.remotePostId === "string" && xPostLink(data.remotePostId) ? { remotePostId: data.remotePostId } : {}),
    ...(typeof data.errorCode === "string" ? { errorCode: data.errorCode } : {}),
    ...(typeof data.nextCheckAt === "string" && Number.isFinite(Date.parse(data.nextCheckAt)) ? { nextCheckAt: data.nextCheckAt } : {}),
  };
}

export function xPublishStateLabel(state?: XPublicationState) {
  return ({
    preparing: "X: 動画処理待ち", sending: "X: 送信確認中", published: "X: 公開済み",
    rejected: "X: 送信されませんでした", unknown: "X: 結果不明・再送禁止",
  } as Record<XPublicationState, string>)[state ?? "unknown"];
}

export function xPublishMessage(state: XPublicationState) {
  return ({
    preparing: "動画をXへアップロードしました。処理完了を確認してから投稿します。",
    sending: "送信結果を確認中です。再送せず、保存状態を確認してください。",
    published: "Xに公開しました。他のSNSには送信していません。",
    rejected: "Xへの送信は完了しませんでした。原因を確認してください。",
    unknown: "Xの公開結果を確定できません。重複防止のため再送しないでください。X上の投稿を手動で確認してください。",
  } as Record<XPublicationState, string>)[state];
}

export function xPublishErrorMessage(code: unknown) {
  const messages: Record<string, string> = {
    forbidden: "この投稿を送信する権限がありません。",
    workspace_forbidden: "この投稿を送信する権限がありません。",
    invalid_request: "投稿の指定が正しくありません。",
    invalid_text: "本文の内容または加重文字数を確認してください。",
    invalid_media: "画像・動画の形式と容量を確認してください。",
    not_connected: "Xの接続設定を確認してください。",
    needs_review: "Xの接続設定を確認してください。",
    needs_reauthorization: "Xに再連携してから、投稿状態を確認してください。",
    already_published: "この投稿はすでにXへ公開済みです。",
    publication_locked: "投稿処理中、結果不明、または公開済みのため変更できません。",
    rate_limited: "Xの利用制限に達しました。送信状態を確認してください。",
    media_processing_failed: "Xで動画を処理できませんでした。",
    media_permission_required: "画像・動画にはXの追加権限が必要です。API設定でmedia.writeを保存し、Xへ再連携してください。",
    unsupported_media: "Xの添付はJPEG・PNG画像またはMP4動画に限ります。",
    media_too_large: "Xの画像は1枚5MiB、MP4動画は20MiBまでです。",
    media_failed: "Xで添付メディアを処理できませんでした。",
    media_expired: "Xにアップロードしたメディアの期限が切れました。投稿状態を確認してください。",
    authorization_failed: "Xの権限を確認し、必要に応じて再連携してください。",
    stale_snapshot: "送信中の内容と保存内容が異なります。履歴の保存状態を確認してください。",
    confirmation_changed: "確認した本文・ファイル・接続先が変更されました。内容をもう一度確認してください。",
    busy: "別の投稿操作を確認中です。再送せず保存状態を確認してください。",
    not_configured: "Xの接続設定を確認してください。",
    request_conflict: "送信済みの内容と異なります。履歴の保存状態を確認してください。",
  };
  return typeof code === "string" && Object.hasOwn(messages, code)
    ? messages[code] : "Xへの操作を完了できませんでした。履歴の保存状態を確認してください。";
}

export async function xMediaDigest(blob: Blob, expectedSize: number) {
  if (blob.size !== expectedSize) throw new Error("confirmation_changed");
  const bytes = await blob.arrayBuffer();
  if (bytes.byteLength !== expectedSize) throw new Error("confirmation_changed");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { bytes, sha256 };
}

/** File copies the bytes, so later state changes cannot alter the confirmed upload. */
export async function freezeXMediaFile(file: File, expectedSize: number) {
  const { bytes, sha256 } = await xMediaDigest(file, expectedSize);
  return { file: new File([bytes], file.name, { type: file.type, lastModified: file.lastModified }), sha256 };
}

export function parseXConnectionPreview(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(data.fingerprint)) return null;
  return {
    fingerprint: data.fingerprint,
    ...(typeof data.username === "string" && /^[a-zA-Z0-9_]{1,15}$/.test(data.username) ? { username: data.username } : {}),
  };
}

export function xPublishBody(postId: string, requestId: string, fileIds: string[], expected: XPublishExpected) {
  return {
    action: "publish", postId, requestId, fileIds: [...fileIds],
    expected: { body: expected.body, files: expected.files.map((file) => ({
      id: file.id, storagePath: file.storagePath, mimeType: file.mimeType, sizeBytes: file.sizeBytes, sha256: file.sha256,
    })),
      connectionFingerprint: expected.connectionFingerprint },
  };
}
