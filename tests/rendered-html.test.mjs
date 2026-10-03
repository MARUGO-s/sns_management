import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Instatic TalksX operations console", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Instatic TalksX<\/title>/i);
  assert.match(html, /安全な接続を確認しています|設定が必要です/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/i);
});

test("server-renders the protected administrator route", async () => {
  const response = await render("/admin");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /管理コンソール|管理者専用ページ/);
  assert.match(html, /管理者権限を確認しています|管理者専用ページ/);
});

test("starter preview files are not part of the finished site", async () => {
  await assert.rejects(
    access(new URL("../app/_sites-preview", import.meta.url)),
  );
});

test("store affiliation, administrator schedules, and knowledge maps remain wired into the app", async () => {
  const [
    consoleSource,
    adminSource,
    migrationSource,
    graphAsset,
    environmentAsset,
    graphStats,
    packageSource,
    agentRules,
  ] =
    await Promise.all([
    readFile(new URL("../app/social-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-console.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../supabase/migrations/20261003182551_social_sns_management_bootstrap.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../public/system-map/graph.html", import.meta.url), "utf8"),
    readFile(
      new URL("../public/system-map/environment.html", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../public/system-map/graph-stats.json", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
  ]);

  assert.match(consoleSource, /所属店舗/);
  assert.match(consoleSource, /social_store_id/);
  assert.match(consoleSource, /Googleで続ける/);
  assert.match(consoleSource, /業務データはアカウントごとに保護されます/);
  assert.match(consoleSource, /readOAuthCallbackError/);
  assert.match(consoleSource, /rollbackFailedSchedule/);
  assert.match(consoleSource, /再予約/);
  assert.match(consoleSource, /公開予定は現在より後の日時を指定してください/);
  assert.match(consoleSource, /isFreshAuthUser/);
  assert.match(adminSource, /公開予定日時がない投稿は予約済みにできません/);
  assert.match(adminSource, /fetchAllRows/);
  assert.match(adminSource, /AdminPager/);
  assert.match(adminSource, /前へ/);
  assert.match(adminSource, /次へ/);
  assert.match(adminSource, /予約予定/);
  assert.match(adminSource, /店舗別運用状況/);
  assert.match(adminSource, /全店舗/);
  assert.match(adminSource, /システムマップ/);
  assert.match(adminSource, /\/system-map\/graph\.html/);
  assert.match(adminSource, /\/system-map\/environment\.html/);
  assert.match(adminSource, /\/system-map\/graph-stats\.json/);
  assert.match(adminSource, /実行環境・AI知識循環/);
  assert.match(migrationSource, /create table public\.social_stores/);
  assert.match(migrationSource, /'BLU NERO'/);
  assert.match(graphAsset, /vis-network/);
  assert.match(environmentAsset, /Graphify × Obsidian × AI/);
  assert.match(environmentAsset, /AI・Graphify・Obsidian知識循環/);
  const parsedStats = JSON.parse(graphStats);
  assert.ok(parsedStats.nodes > 0);
  assert.ok(parsedStats.edges > 0);
  assert.ok(parsedStats.communities > 0);
  assert.match(packageSource, /"knowledge:update"/);
  assert.match(packageSource, /"knowledge:check"/);
  assert.match(agentRules, /Graphify-first investigation/);
  assert.match(agentRules, /Obsidian/);
});

test("video files support playback, timeline editing, and safe processing", async () => {
  const [
    consoleSource,
    editorSource,
    migrationSource,
    recoveryMigration,
    workerSource,
    dispatcherSource,
    viewerSource,
    timelineSource,
    timelineMigration,
    timelineHardeningMigration,
    timelineRemainingMigration,
  ] =
    await Promise.all([
      readFile(new URL("../app/social-console.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/media-editor.tsx", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../supabase/migrations/20261003182551_social_sns_management_bootstrap.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/20261003182551_social_sns_management_bootstrap.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../workers/media-processor/processor.mjs", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../supabase/functions/social-media-jobs/index.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/video-viewer.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../workers/media-processor/timeline-plan.mjs", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/20261003182551_social_sns_management_bootstrap.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/20261003182551_social_sns_management_bootstrap.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/20261003182551_social_sns_management_bootstrap.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

  assert.match(consoleSource, /動画編集/);
  assert.match(consoleSource, /<span>動画編集<\/span>/);
  assert.match(consoleSource, /social-media-jobs/);
  assert.match(consoleSource, /処理を再実行/);
  assert.match(consoleSource, /停止した処理を再実行/);
  assert.match(consoleSource, /openVideoViewer/);
  assert.match(consoleSource, /アプリ内再生/);
  assert.match(consoleSource, /編集済み/);
  assert.match(consoleSource, /createSignedUrl\(file\.storagePath, 60 \* 60\)/);
  assert.match(consoleSource, /videoRequestId/);
  assert.match(consoleSource, /<VideoViewer/);
  assert.match(viewerSource, /アプリ内で動画を再生/);
  assert.match(viewerSource, /controls/);
  assert.match(viewerSource, /playsInline/);
  assert.match(viewerSource, /event\.key === "Escape"/);
  assert.match(viewerSource, /動画を読み込めませんでした/);
  assert.match(editorSource, /"1:1".*"4:5".*"9:16".*"16:9"/s);
  assert.match(editorSource, /時間を編集/);
  assert.match(editorSource, /途中をカット/);
  assert.match(editorSource, /開始位置を調整/);
  assert.match(editorSource, /終了位置を調整/);
  assert.match(editorSource, /動画全体を削除するカットは追加できません/);
  assert.match(editorSource, /終了は開始より後にしてください/);
  assert.match(editorSource, /parseTimeInput/);
  assert.match(editorSource, /プレビュー再生では途中カットを自動で飛ばします/);
  assert.match(editorSource, /startTime/);
  assert.match(editorSource, /endTime/);
  assert.match(editorSource, /cuts/);
  assert.match(migrationSource, /create table public\.social_media_jobs/);
  assert.match(migrationSource, /media_variant/);
  assert.match(recoveryMigration, /'dispatching'/);
  assert.match(workerSource, /generated_from_file_id/);
  assert.match(workerSource, /libx264/);
  assert.match(workerSource, /x-upsert": "true"/);
  assert.match(workerSource, /createEncodingPlan/);
  assert.match(workerSource, /createTimelinePlan/);
  assert.match(workerSource, /createTimelineFilter/);
  assert.match(workerSource, /Processed video exceeds the 50 MB limit/);
  assert.match(timelineSource, /maximumCuts = 32/);
  assert.match(timelineSource, /concat=n=/);
  assert.match(timelineMigration, /is_valid_media_timeline_config/);
  assert.match(timelineMigration, /jsonb_array_length/);
  assert.match(timelineHardeningMigration, /is distinct from/);
  assert.match(timelineHardeningMigration, /trim_end - trim_start < 0\.5/);
  assert.match(timelineRemainingMigration, /removed_duration/);
  assert.match(timelineRemainingMigration, /merged_end - merged_start/);
  assert.match(dispatcherSource, /staleAfterMs/);
  assert.match(dispatcherSource, /status: "dispatching"/);
});
