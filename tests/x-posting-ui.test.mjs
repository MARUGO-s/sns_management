import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes, createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const source = await readFile(new URL("../app/lib/x-posting.ts", import.meta.url), "utf8");
const require = createRequire(import.meta.url);
const moduleCode = stripTypeScriptTypes(source).replace('"twitter-text"', JSON.stringify(pathToFileURL(require.resolve("twitter-text")).href));
const helpers = await import(`data:text/javascript;base64,${Buffer.from(moduleCode).toString("base64")}`);
const image = (id = "image", size = helpers.xImageLimit) => ({ id, name: "synthetic.png", type: "image/png", size });
const video = (size = helpers.xVideoLimit) => ({ id: "video", name: "synthetic.mp4", type: "video/mp4", size });

test("official X text parser handles Japanese, emoji, normalization, and shortened URLs", () => {
  assert.equal(helpers.validateXPost("あ".repeat(140), []).valid, true);
  assert.equal(helpers.validateXPost("あ".repeat(141), []).valid, false);
  assert.equal(helpers.validateXPost("👨‍👩‍👧‍👦".repeat(140), []).weightedLength, 280);
  assert.equal(helpers.validateXPost("https://example.com/" + "a".repeat(500), []).weightedLength, 23);
  assert.equal(helpers.validateXPost(" e\u0301 ", []).text, "é");
  assert.equal(helpers.validateXPost("\ufffe", []).valid, false);
  assert.equal(helpers.validateXPost("  ", [image()]).valid, false);
});

test("manual X validation only permits four small images or one conservative-sized MP4", () => {
  assert.equal(helpers.validateXPost("text", []).valid, true);
  assert.equal(helpers.validateXPost("text", Array.from({ length: 4 }, (_, i) => image(String(i)))).valid, true);
  assert.equal(helpers.validateXPost("text", [video()]).valid, true);
  for (const files of [[image("i", helpers.xImageLimit + 1)], [video(helpers.xVideoLimit + 1)],
    [image(), video()], [video(), video()], Array.from({ length: 5 }, (_, i) => image(String(i))),
    [{ ...image(), type: "image/gif" }], [{ ...video(), type: "video/webm" }],
    [{ ...image(), type: "application/pdf" }], [image("empty", 0)], [image("bad", NaN)]]) {
    assert.equal(helpers.validateXPost("text", files).valid, false);
  }
});

test("publication locks and result parsing never trust token fields, errors, or remote URLs", () => {
  for (const state of ["preparing", "sending", "unknown", "published"]) {
    assert.equal(helpers.xAttemptLocksPost({ state }), true);
  }
  assert.equal(helpers.xAttemptLocksPost({ state: "rejected" }), false);
  assert.equal(helpers.xAttemptLocksPost(null), false);
  assert.equal(helpers.xPostLink("123456789"), "https://x.com/i/web/status/123456789");
  for (const id of ["0", "-1", "1e4", "https://evil.test", "<script>", null]) assert.equal(helpers.xPostLink(id), null);
  const result = helpers.parseXPublishResult({ state: "published", attemptId: "attempt", requestId: "request",
    remotePostId: "123", accessToken: "must-be-dropped", snapshot: { body: "must-be-dropped" } });
  assert.deepEqual(result, { state: "published", attemptId: "attempt", requestId: "request", remotePostId: "123" });
  assert.equal(helpers.parseXPublishResult({ state: "sent", attemptId: "attempt", requestId: "request" }), null);
  assert.doesNotMatch(helpers.xPublishErrorMessage("<script>private-token"), /script|private-token/);
  assert.doesNotMatch(helpers.xPublishErrorMessage("constructor"), /function|Object/);
  const expected = { body: "RAW confirmed body", files: [], connectionFingerprint: "a".repeat(64) };
  assert.deepEqual(helpers.xPublishBody("post", "request", ["b", "a"], expected), {
    action: "publish", postId: "post", requestId: "request", fileIds: ["b", "a"], expected,
  });
  assert.doesNotMatch(helpers.xAttemptProjection, /snapshot|token|secret|body|media_ids/);
});

test("reload retains the same request and an older rejection never unlocks a new lost send", () => {
  const old = { id: "old", post_id: "post", workspace_id: "workspace", request_id: "old-request",
    state: "rejected", remote_post_id: null, error_code: null, created_at: "", updated_at: "" };
  const pending = [{ postId: "post", requestId: "new-request" }];
  let merged = helpers.reconcileXAttempts([old], pending, "workspace");
  assert.equal(merged.post.state, "unknown");
  assert.equal(merged.post.request_id, "new-request");
  assert.equal(helpers.xAttemptLocksPost(merged.post), true);
  const preparing = { ...old, id: "new", request_id: "new-request", state: "preparing" };
  merged = helpers.reconcileXAttempts([preparing, old], pending, "workspace");
  assert.equal(merged.post.state, "preparing");
  assert.equal(merged.post.request_id, "new-request");
  const published = { ...preparing, state: "published", remote_post_id: "123" };
  merged = helpers.reconcileXAttempts([published, old], [{ postId: "post", requestId: "lost-other" }], "workspace");
  assert.equal(merged.post.state, "published");
  assert.equal(merged.post.remote_post_id, "123");
  merged = helpers.reconcileXAttempts([{ ...preparing, workspace_id: "other" }], pending, "workspace");
  assert.equal(merged.post.state, "unknown");
  merged = helpers.reconcileXAttempts([{ ...preparing, state: "sending", updated_at: "2026-01-01T00:00:00Z" }],
    [], "workspace", Date.parse("2026-01-01T00:03:00Z"));
  assert.equal(merged.post.state, "unknown");
  assert.equal(merged.post.error_code, "unknown_result");
});

const syntheticRecord = {
  id: "post", title: "Synthetic post", body: "Synthetic body", time: "未設定", scheduledAt: null,
  channels: ["x", "instagram"], status: "下書き", owner: "Synthetic", format: "Post", savedAt: "",
  files: [],
};
async function renderConsole({ view = "compose", state, viewer = false, confirmation = false } = {}) {
  const attempt = state ? {
    id: "attempt", post_id: "post", workspace_id: "workspace", request_id: "stable-request",
    state, remote_post_id: state === "published" ? "123" : null, error_code: null, created_at: "", updated_at: "",
  } : null;
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false, appType: "custom", optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    plugins: [{
      name: "synthetic-x-publication",
      enforce: "pre",
      transform(code, id) {
        if (id.endsWith("/app/lib/supabase.ts")) return { code: "export const supabase = {}; export const googleAuthEnabled = false;", map: null };
        if (!id.endsWith("/app/social-console.tsx")) return null;
        const replacements = [
          ['useState<ViewId>("compose")', `useState<ViewId>("${view}")`],
          ['useState<User | null>(null)', 'useState<User | null>({ id: "synthetic-user" } as User)'],
          ['useState(Boolean(supabase))', 'useState(false)'],
          ['const [canPublishX, setCanPublishX] = useState(false);', `const [canPublishX, setCanPublishX] = useState(${!viewer});`],
          ['const [xAttemptsLoaded, setXAttemptsLoaded] = useState(false);', 'const [xAttemptsLoaded, setXAttemptsLoaded] = useState(true);'],
          ['useState<ChannelId[]>([])', 'useState<ChannelId[]>(["x"])'],
          ['const [postText, setPostText] = useState("");', 'const [postText, setPostText] = useState("Synthetic body");'],
          ['status: "未設定",', 'status: "登録済み",'],
          ['useState<HistoryRecord[]>([])', `useState<HistoryRecord[]>(${JSON.stringify([syntheticRecord])})`],
          ['useState<Record<string, XPublicationAttempt>>({})', `useState<Record<string, XPublicationAttempt>>(${JSON.stringify(attempt ? { post: attempt } : {})})`],
        ];
        if (confirmation) replacements.push(['useState<XPublishConfirmation | null>(null)', `useState<XPublishConfirmation | null>(${JSON.stringify({
          workspaceId: "workspace", body: "Frozen synthetic body", files: [], channels: ["x"],
          requestId: "stable-request", resume: false,
          expected: { body: "Frozen synthetic body", files: [], connectionFingerprint: "a".repeat(64) },
        })})`]);
        for (const [from, to] of replacements) {
          assert.ok(code.includes(from), `Fixture anchor exists: ${from}`);
          code = code.replace(from, to);
        }
        return { code, map: null };
      },
    }],
  });
  try {
    const { default: Console } = await server.ssrLoadModule("/app/social-console.tsx");
    return renderToStaticMarkup(createElement(Console));
  } finally { await server.close(); }
}
function button(html, label) {
  const value = (html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []).find((candidate) => candidate.includes(label));
  assert.ok(value, `Rendered button: ${label}`);
  return value;
}
test("real composer keeps reservation save separate from confirmed X-only original-media publish", async () => {
  const html = await renderConsole();
  assert.match(html, /予約を保存/);
  assert.match(html, /SNSへの自動公開は準備中/);
  assert.match(html, /X加重文字数.*280/);
  assert.match(html, /費用が発生する可能性/);
  assert.match(html, /動画編集は反映しません/);
  assert.doesNotMatch(button(html, "Xへの投稿内容を確認"), /disabled/);
  const viewer = await renderConsole({ viewer: true });
  assert.match(button(viewer, "Xへの投稿内容を確認"), /disabled/);
});
test("real history locks unknown/sending/published posts and resumes only preparing video", async () => {
  for (const state of ["unknown", "sending", "published"]) {
    const html = await renderConsole({ view: "history", state });
    assert.doesNotMatch(html, />Xへの投稿内容を確認<|>再予約<|>削除</);
    assert.match(html, /保存状態を確認（X APIへの通信なし）/);
    assert.match(html, /未公開（送信機能は未実装）/);
    if (state === "unknown") assert.match(html, /重複防止のため再送しないでください/);
    if (state === "published") assert.match(html, /href="https:\/\/x.com\/i\/web\/status\/123"/);
  }
  const preparing = await renderConsole({ view: "history", state: "preparing" });
  assert.match(preparing, /動画の処理状況を確認して投稿/);
  assert.doesNotMatch(preparing, />再予約<|>削除</);
});
test("confirmation shows frozen text, explicit X-only cost notice, and no automatic retry", async () => {
  const html = await renderConsole({ confirmation: true });
  assert.match(html, /Frozen synthetic body/);
  assert.match(html, /送信先: 接続済みのXアカウント.*のみ/);
  assert.match(html, /この内容をXへ公開する/);
  assert.match(html, /公開結果が不明な場合は自動再送しません/);
});

test("sending retains durable draft/files while video resumes reuse saved request identifiers", async () => {
  const consoleSource = await readFile(new URL("../app/social-console.tsx", import.meta.url), "utf8");
  const manual = consoleSource.slice(consoleSource.indexOf("async function publishConfirmedX()"),
    consoleSource.indexOf("async function loadWorkspaceData("));
  assert.match(manual, /scheduled_at: null, status: "draft"/);
  assert.doesNotMatch(manual, /social-media-jobs|social_media_jobs|attachment\.crop/);
  assert.ok(manual.indexOf("fileIds.push(saved.id)") < manual.indexOf("dispatchAttempted = true"));
  assert.ok(manual.indexOf("dispatchAttempted = true") < manual.indexOf("await invokeXPublish"));
  assert.match(manual, /if \(!dispatchAttempted && !snapshot\.postId && postId\)/);
  assert.match(consoleSource, /const requestId = resume && attempt \? attempt\.request_id : crypto\.randomUUID\(\)/);
  assert.match(consoleSource, /body: \{ action: "status", postId \}/);
  assert.match(consoleSource, /select\(xAttemptProjection\)/);
  assert.match(helpers.xPublishErrorMessage("media_permission_required"), /media\.write.*再連携/);
});

test("confirmation snapshot transmits raw DB body, ordered file hashes and connection binding without live-state aliases", () => {
  const raw = "  e\u0301\n ";
  const expected = { body: raw, connectionFingerprint: "a".repeat(64), files: [
    { id: "b", storagePath: "workspace/post/b.png", mimeType: "image/png", sizeBytes: 5, sha256: "b".repeat(64),
      accessToken: "discard-this-test-only-value" },
    { id: "a", storagePath: "workspace/post/a.png", mimeType: "image/png", sizeBytes: 6, sha256: "c".repeat(64) },
  ] };
  const payload = helpers.xPublishBody("post", "request", ["b", "a"], expected);
  assert.equal(helpers.validateXPost(raw, []).text, "é");
  assert.equal(payload.expected.body, raw, "DB equality must compare raw saved body, not the normalized preview");
  assert.deepEqual(payload.expected.files.map((file) => file.id), ["b", "a"]);
  assert.equal(payload.expected.connectionFingerprint, "a".repeat(64));
  assert.equal(payload.expected.files[0].sha256, "b".repeat(64));
  assert.equal("accessToken" in payload.expected.files[0], false);
  expected.body = "Edited after confirmation";
  expected.files[0].storagePath = "Changed after confirmation";
  expected.files[0].sha256 = "d".repeat(64);
  assert.equal(payload.expected.body, raw);
  assert.equal(payload.expected.files[0].storagePath, "workspace/post/b.png");
  assert.equal(payload.expected.files[0].sha256, "b".repeat(64));
});

test("media digest pins bytes and size; the frozen upload File survives changes to source buffers", async () => {
  const bytes = new TextEncoder().encode("hello");
  const original = new File([bytes], "synthetic.png", { type: "image/png", lastModified: 100 });
  const frozen = await helpers.freezeXMediaFile(original, 5);
  bytes.fill(120);
  assert.equal(frozen.sha256, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  assert.equal(await frozen.file.text(), "hello");
  assert.equal(frozen.file.name, "synthetic.png");
  assert.equal(frozen.file.type, "image/png");
  assert.equal(frozen.file.lastModified, 100);
  assert.notEqual(frozen.file, original);
  await assert.rejects(() => helpers.xMediaDigest(original, 6), /confirmation_changed/);
});

test("nonsecret preview only supplies a validated target and opaque fingerprint", () => {
  assert.deepEqual(helpers.parseXConnectionPreview({
    fingerprint: "a".repeat(64), username: "synthetic_user", accessToken: "discard",
  }), { fingerprint: "a".repeat(64), username: "synthetic_user" });
  assert.deepEqual(helpers.parseXConnectionPreview({
    fingerprint: "b".repeat(64), username: "<script>bad</script>",
  }), { fingerprint: "b".repeat(64) });
  for (const value of [null, {}, { fingerprint: "short" }, { fingerprint: "<script>" }]) {
    assert.equal(helpers.parseXConnectionPreview(value), null);
  }
});

test("real confirmation wiring hashes captured originals and sends expected metadata only after upload IDs are assigned", async () => {
  const code = await readFile(new URL("../app/social-console.tsx", import.meta.url), "utf8");
  assert.match(code, /action: "preview", workspaceId: confirmedWorkspace/);
  assert.match(code, /const rawBody = record \? body : validation\.text/);
  assert.match(code, /freezeXMediaFile\(file\.file, file\.size\)/);
  assert.match(code, /\.download\(file\.storagePath\)/);
  assert.match(code, /xMediaDigest\(blob, file\.size\)/);
  assert.match(code, /body: xPublishBody\(postId, requestId, fileIds, expected\)/);
  assert.match(code, /expected\.files\[index\] = \{ \.\.\.expected\.files\[index\], id: saved\.id, storagePath \}/);
  const confirm = code.slice(code.indexOf("async function confirmXPublish("), code.indexOf("async function publishConfirmedX()"));
  assert.ok(confirm.indexOf("xPublishBusy.current = true") < confirm.indexOf("await supabase.functions.invoke"));
  assert.match(confirm, /finally \{\s*xPublishBusy\.current = false/);
});

test("only a matching, exact, allowlisted notStarted failure proves initial publication did not begin", () => {
  const proof = { error: "stale_snapshot", notStarted: true, requestId: "matching-request" };
  assert.deepEqual(helpers.parseXNotStartedFailure(proof, "matching-request"), {
    error: "stale_snapshot", requestId: "matching-request",
  });
  for (const value of [
    null, undefined, {}, [],
    { state: "not_started" },
    { error: "stale_snapshot", requestId: "matching-request" },
    { ...proof, notStarted: "true" }, { ...proof, notStarted: 1 }, { ...proof, notStarted: false },
    { ...proof, requestId: "other-request" }, { ...proof, requestId: null },
    { ...proof, error: "unrecognized_failure" }, { ...proof, error: "<script>private</script>" },
    { ...proof, state: "published" }, { ...proof, remotePostId: "123" },
  ]) assert.equal(helpers.parseXNotStartedFailure(value, "matching-request"), null);
  assert.equal(helpers.parseXNotStartedFailure(proof, "different-current-request"), null);
  assert.equal(helpers.parseXNotStartedFailure({ ...proof, requestId: "" }, ""), null);
});

test("definite-not-started recovery clears only the matching pending pair and optimistic unknown, never saved uncertainty", () => {
  const pending = [
    { postId: "post", requestId: "matching-request" },
    { postId: "post", requestId: "newer-request" },
    { postId: "other-post", requestId: "matching-request" },
  ];
  assert.deepEqual(helpers.removeXPendingRequest(pending, "post", "matching-request"), pending.slice(1));
  assert.equal(pending.length, 3, "Original pending data remains unchanged");
  const optimistic = {
    id: "", post_id: "post", workspace_id: "workspace", request_id: "matching-request",
    state: "unknown", remote_post_id: null, error_code: null, created_at: "", updated_at: "",
  };
  const other = { ...optimistic, post_id: "other-post", id: "persisted-attempt" };
  const attempts = { post: optimistic, "other-post": other };
  const cleared = helpers.removeXOptimisticAttempt(attempts, "post", "matching-request");
  assert.deepEqual(cleared, { "other-post": other });
  assert.equal(attempts.post, optimistic, "Original state remains unchanged");
  assert.equal(helpers.removeXOptimisticAttempt(attempts, "post", "other-request"), attempts);
  for (const attempt of [
    { ...optimistic, id: "persisted-unknown-attempt" },
    { ...optimistic, state: "sending" },
    { ...optimistic, state: "published", id: "published-attempt" },
  ]) {
    const saved = { post: attempt };
    assert.equal(helpers.removeXOptimisticAttempt(saved, "post", "matching-request"), saved);
  }
});

test("notStarted clearing is restricted to publish-error proof; ordinary status and transport errors remain locked", async () => {
  const code = await readFile(new URL("../app/social-console.tsx", import.meta.url), "utf8");
  const invoke = code.slice(code.indexOf("async function invokeXPublish("), code.indexOf("async function checkXPublishStatus("));
  assert.match(invoke, /const proof = parseXNotStartedFailure\(failureData, requestId\)/);
  assert.match(invoke, /if \(proof\) \{\s*rememberXUncertain\(id, postId, proof\.requestId, false\)/);
  assert.match(invoke, /removeXOptimisticAttempt\(current, postId, proof\.requestId\)/);
  assert.match(invoke, /await loadXAttempts\(id\)\.catch/);
  assert.match(invoke, /catch \{ return \{ result: null, failureMessage: "", notStarted: false \}; \}/);
  const status = code.slice(code.indexOf("async function checkXPublishStatus("), code.indexOf("async function confirmXPublish("));
  assert.doesNotMatch(status, /parseXNotStartedFailure|removeXOptimisticAttempt|rememberXUncertain/);
  const manual = code.slice(code.indexOf("async function publishConfirmedX()"), code.indexOf("async function loadWorkspaceData("));
  assert.match(manual, /message = notStarted\s*\? `\$\{failureMessage\} Xへの送信は開始されていません/);
  assert.match(manual, /if \(failureMessage && !notStarted\)/);
});
