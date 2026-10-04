import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

test("post searches combine status and query without changing total schedules or source order", async () => {
  const server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, appType: "custom", optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
  try {
    const { filterPosts, scheduledPosts } = await server.ssrLoadModule("/app/lib/post-list.ts");
    const posts = [
      { id: "late", title: "週末", body: "ワイン", owner: "担当A", channels: ["instagram"], status: "予約済み", scheduledAt: "2026-10-06T12:00:00+09:00" },
      { id: "draft", title: "ランチ", body: "メニュー", owner: "担当B", channels: ["x"], status: "下書き", scheduledAt: null },
      { id: "early", title: "ランチ", body: "おすすめ", owner: "担当B", channels: ["threads"], status: "予約済み", scheduledAt: "2026-10-05T12:00:00+09:00" },
      { id: "failed", title: "ランチ", body: "メニュー", owner: "担当C", channels: ["tiktok"], status: "失敗", scheduledAt: null },
    ];
    assert.deepEqual(scheduledPosts(posts).map((post) => post.id), ["early", "late"]);
    assert.deepEqual(filterPosts(scheduledPosts(posts), "ランチ").map((post) => post.id), ["early"]);
    assert.equal(scheduledPosts(posts).length, 2, "A filtered list must not change the schedule summary");
    assert.deepEqual(filterPosts(posts, " メニュー ", "下書き").map((post) => post.id), ["draft"]);
    assert.deepEqual(filterPosts(posts, "THREADS").map((post) => post.id), ["early"]);
    assert.deepEqual(filterPosts(posts, "担当C", "失敗").map((post) => post.id), ["failed"]);
    assert.equal(filterPosts(posts, "", "失敗").length, 1);
    assert.equal(filterPosts(posts, "存在しない投稿").length, 0);
    assert.deepEqual(posts.map((post) => post.id), ["late", "draft", "early", "failed"]);
  } finally { await server.close(); }
});
