import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const projectDir = fileURLToPath(new URL("../", import.meta.url));
const modelPath = join(projectDir, "knowledge/system-architecture.json");
const graphPath = join(projectDir, "graphify-out/graph.json");
const publicDir = join(projectDir, "public/system-map");
const docsDir = join(projectDir, "docs");

const vaultAppDir =
  process.env.KNOWLEDGE_VAULT_APP_DIR ??
  "/Users/yoshito/Library/CloudStorage/Dropbox/web/アプリ知識/10_アプリ別/Instatic TalksX";
const vaultGraphifyDir =
  process.env.KNOWLEDGE_VAULT_GRAPHIFY_DIR ??
  join(vaultAppDir, "90_Graphify");
const vaultAiDir = join(vaultAppDir, "70_AI作業環境");

const model = JSON.parse(await readFile(modelPath, "utf8"));
const graph = JSON.parse(await readFile(graphPath, "utf8"));
const stats = {
  nodes: graph.nodes?.length ?? 0,
  edges: graph.links?.length ?? 0,
  communities: new Set(
    (graph.nodes ?? [])
      .map((node) => node.community)
      .filter((community) => community !== undefined && community !== null),
  ).size,
  builtAtCommit: graph.built_at_commit ?? "unknown",
};
const generatedAt = new Date().toISOString();

await Promise.all([
  mkdir(publicDir, { recursive: true }),
  mkdir(docsDir, { recursive: true }),
  mkdir(vaultAiDir, { recursive: true }),
  mkdir(vaultGraphifyDir, { recursive: true }),
]);

const colors = {
  people: "#5b7cfa",
  frontend: "#14b8a6",
  hosting: "#0ea5e9",
  delivery: "#8b5cf6",
  supabase: "#22c55e",
  edge: "#10b981",
  google: "#f59e0b",
  security: "#ef4444",
  storage: "#64748b",
  ai: "#a855f7",
  knowledge: "#2563eb",
  graph: "#06b6d4",
  code: "#334155",
  obsidian: "#7c3aed",
  automation: "#f97316",
};

const edgeColors = {
  user: "#93c5fd",
  delivery: "#c4b5fd",
  backup: "#94a3b8",
  auth: "#67e8f9",
  data: "#86efac",
  secret: "#fca5a5",
  job: "#fdba74",
  knowledge: "#c4b5fd",
  query: "#67e8f9",
  generation: "#a7f3d0",
  code: "#cbd5e1",
  writeback: "#f0abfc",
  automation: "#fdba74",
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeXml(value) {
  return escapeHtml(value).replaceAll("'", "&apos;");
}

function splitLabel(value) {
  return String(value).split(/\n/);
}

function renderSvg(view) {
  const nodes = model.nodes.filter((node) => node.view === view.id);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = model.edges.filter(
    (edge) =>
      edge.view === view.id &&
      nodeById.has(edge.from) &&
      nodeById.has(edge.to),
  );
  const markerIds = [...new Set(edges.map((edge) => edge.kind))];

  const defs = markerIds
    .map(
      (kind) => `
      <marker id="arrow-${kind}" viewBox="0 0 10 10" refX="9" refY="5"
        markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="${edgeColors[kind] ?? "#94a3b8"}" />
      </marker>`,
    )
    .join("");

  const edgeSvg = edges
    .map((edge) => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      const startX = from.x + from.width / 2;
      const startY = from.y + from.height / 2;
      const endX = to.x + to.width / 2;
      const endY = to.y + to.height / 2;
      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const horizontal = Math.abs(deltaX) >= Math.abs(deltaY);
      const x1 =
        startX +
        (horizontal
          ? Math.sign(deltaX || 1) * (from.width / 2 + 4)
          : 0);
      const y1 =
        startY +
        (!horizontal
          ? Math.sign(deltaY || 1) * (from.height / 2 + 4)
          : 0);
      const x2 =
        endX -
        (horizontal ? Math.sign(deltaX || 1) * (to.width / 2 + 10) : 0);
      const y2 =
        endY -
        (!horizontal ? Math.sign(deltaY || 1) * (to.height / 2 + 10) : 0);
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      return `
        <g class="edge edge-${edge.kind}">
          <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
            stroke="${edgeColors[edge.kind] ?? "#94a3b8"}"
            stroke-width="2.2" marker-end="url(#arrow-${edge.kind})" />
          <rect x="${midX - 70}" y="${midY - 12}" width="140" height="24"
            rx="7" fill="#0f172a" fill-opacity=".92" />
          <text x="${midX}" y="${midY + 4}" text-anchor="middle"
            fill="#dbeafe" font-size="12" font-weight="650">${escapeXml(edge.label)}</text>
        </g>`;
    })
    .join("");

  const nodeSvg = nodes
    .map((node) => {
      const color = colors[node.group] ?? "#64748b";
      const titleLines = splitLabel(node.label);
      const titleStart =
        node.y + 30 - ((titleLines.length - 1) * 9);
      const title = titleLines
        .map(
          (line, index) =>
            `<tspan x="${node.x + node.width / 2}" dy="${index ? 20 : 0}">${escapeXml(line)}</tspan>`,
        )
        .join("");
      const description = escapeXml(node.description);
      return `
        <g class="node" data-node-id="${escapeXml(node.id)}">
          <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"
            rx="14" fill="#111827" stroke="${color}" stroke-width="2.5" />
          <rect x="${node.x}" y="${node.y}" width="8" height="${node.height}"
            rx="4" fill="${color}" />
          <text x="${node.x + node.width / 2}" y="${titleStart}" text-anchor="middle"
            fill="#f8fafc" font-size="15" font-weight="800">${title}</text>
          <foreignObject x="${node.x + 18}" y="${node.y + 58}"
            width="${node.width - 36}" height="${Math.max(30, node.height - 68)}">
            <div xmlns="http://www.w3.org/1999/xhtml"
              style="color:#aebbd0;font:12px/1.35 system-ui;text-align:center;overflow:hidden">
              ${description}
            </div>
          </foreignObject>
        </g>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${view.width} ${view.height}" role="img"
    aria-labelledby="${view.id}-title ${view.id}-desc"
    xmlns="http://www.w3.org/2000/svg">
    <title id="${view.id}-title">${escapeXml(view.title)}</title>
    <desc id="${view.id}-desc">${escapeXml(view.description)}</desc>
    <defs>${defs}</defs>
    <rect width="${view.width}" height="${view.height}" fill="#07111f" />
    <text x="40" y="42" fill="#f8fafc" font-size="25" font-weight="850">${escapeXml(view.title)}</text>
    <text x="40" y="66" fill="#94a3b8" font-size="13">${escapeXml(view.description)}</text>
    ${edgeSvg}
    ${nodeSvg}
  </svg>`;
}

const viewSections = model.views
  .map(
    (view, index) => `
      <section class="diagram-panel ${index === 0 ? "is-active" : ""}" data-diagram-panel="${view.id}">
        ${renderSvg(view)}
      </section>`,
  )
  .join("");

const architectureHtml = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(model.project.name)} 環境図</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, "Noto Sans JP", system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #050a12; color: #f8fafc; }
    .shell { margin: 0 auto; max-width: 1580px; padding: 24px; }
    .header { align-items: flex-end; display: flex; gap: 20px; justify-content: space-between; margin-bottom: 18px; }
    .eyebrow { color: #67e8f9; font-size: 12px; font-weight: 850; letter-spacing: .12em; margin: 0 0 7px; text-transform: uppercase; }
    h1 { font-size: clamp(24px, 4vw, 38px); margin: 0; }
    .summary { color: #94a3b8; font-size: 13px; margin: 8px 0 0; max-width: 840px; }
    .stats { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; min-width: 0; }
    .stat { background: #111827; border: 1px solid #25324a; border-radius: 10px; color: #cbd5e1; font-size: 12px; font-weight: 750; max-width: 100%; padding: 9px 11px; white-space: nowrap; }
    .tabs { display: flex; gap: 8px; margin-bottom: 14px; max-width: 100%; overflow-x: auto; padding-bottom: 3px; }
    .tab { background: #111827; border: 1px solid #334155; border-radius: 9px; color: #cbd5e1; cursor: pointer; flex: 0 0 auto; font: inherit; font-size: 13px; font-weight: 800; padding: 10px 14px; white-space: nowrap; }
    .tab.is-active { background: #1d4ed8; border-color: #60a5fa; color: white; }
    .diagram-panel { background: #07111f; border: 1px solid #26344d; border-radius: 14px; display: none; overflow: auto; }
    .diagram-panel.is-active { display: block; }
    svg { display: block; height: auto; min-width: 1050px; width: 100%; }
    .guide { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); margin-top: 16px; }
    .guide article { background: #0f172a; border: 1px solid #273449; border-radius: 12px; padding: 15px; }
    .guide h2 { font-size: 14px; margin: 0 0 8px; }
    .guide p { color: #9fb0c8; font-size: 12px; line-height: 1.6; margin: 0; }
    code { color: #67e8f9; }
    @media (max-width: 720px) {
      .shell { padding: 14px; }
      .header { align-items: flex-start; flex-direction: column; min-width: 0; width: 100%; }
      .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); justify-content: stretch; width: 100%; }
      .stat { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="header">
      <div>
        <p class="eyebrow">Graphify × Obsidian × AI</p>
        <h1>${escapeHtml(model.project.name)} 環境図</h1>
        <p class="summary">実行環境と、AIがGraphify・Obsidianを使って探索・実装・検証・知識保存する循環を、同じ構造モデルから生成しています。</p>
      </div>
      <div class="stats">
        <span class="stat">${stats.nodes} Graphify nodes</span>
        <span class="stat">${stats.edges} relationships</span>
        <span class="stat">${stats.communities} communities</span>
        <span class="stat">generated ${escapeHtml(generatedAt.slice(0, 10))}</span>
      </div>
    </header>
    <nav class="tabs" aria-label="環境図の切替">
      ${model.views
        .map(
          (view, index) =>
            `<button class="tab ${index === 0 ? "is-active" : ""}" type="button" data-diagram-tab="${view.id}">${escapeHtml(view.title)}</button>`,
        )
        .join("")}
    </nav>
    ${viewSections}
    <section class="guide">
      <article><h2>AIの開始点</h2><p><code>AGENTS.md</code> → Obsidianの<code>00_AI_START_HERE</code> → <code>knowledge:check</code>。</p></article>
      <article><h2>コード探索</h2><p>Graphifyのquery/path/explainで絞り、該当コードとSQL/RLSなど必要箇所だけを精読します。</p></article>
      <article><h2>知識の保存</h2><p>設計判断・運用・障害・機能知識はObsidianへ、構造ノートは90_Graphifyへ自動生成します。</p></article>
      <article><h2>更新</h2><p>構造変更後に<code>npm run knowledge:update</code>。検査は<code>npm run knowledge:check</code>。</p></article>
    </section>
  </main>
  <script>
    const tabs = [...document.querySelectorAll("[data-diagram-tab]")];
    const panels = [...document.querySelectorAll("[data-diagram-panel]")];
    function activate(id, updateHash = false) {
      const selected = tabs.find((tab) => tab.dataset.diagramTab === id) ?? tabs[0];
      if (!selected) return;
      tabs.forEach((item) => item.classList.toggle("is-active", item === selected));
      panels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.diagramPanel === selected.dataset.diagramTab));
      if (updateHash) history.replaceState(null, "", "#" + selected.dataset.diagramTab);
    }
    for (const tab of tabs) {
      tab.addEventListener("click", () => {
        activate(tab.dataset.diagramTab, true);
      });
    }
    activate(location.hash.replace(/^#/, "") || "runtime");
  </script>
</body>
</html>`;

function mermaid(viewId) {
  const nodes = model.nodes.filter((node) => node.view === viewId);
  const ids = new Set(nodes.map((node) => node.id));
  const edges = model.edges.filter(
    (edge) =>
      edge.view === viewId && ids.has(edge.from) && ids.has(edge.to),
  );
  const lines = ["flowchart LR"];
  for (const node of nodes) {
    lines.push(
      `  ${node.id}["${String(node.label).replaceAll("\n", "<br/>").replaceAll('"', "'")}"]`,
    );
  }
  for (const edge of edges) {
    lines.push(
      `  ${edge.from} -->|"${String(edge.label).replaceAll('"', "'")}"| ${edge.to}`,
    );
  }
  return lines.join("\n");
}

function canvasForView(viewId) {
  const nodes = model.nodes.filter((node) => node.view === viewId);
  const ids = new Set(nodes.map((node) => node.id));
  const edges = model.edges.filter(
    (edge) =>
      edge.view === viewId && ids.has(edge.from) && ids.has(edge.to),
  );
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: "text",
      text: `# ${node.label}\n\n${node.description}`,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      color: colors[node.group] ?? "#64748b",
    })),
    edges: edges.map((edge, index) => ({
      id: `${viewId}-edge-${index}`,
      fromNode: edge.from,
      fromSide: "right",
      toNode: edge.to,
      toSide: "left",
      label: edge.label,
    })),
  };
}

const sourcePriorityTable = model.sourcePriority
  .map(
    (item) =>
      `| ${item.rank} | ${item.source} | ${item.use} | ${item.warning} |`,
  )
  .join("\n");

const aiContext = `# AI Knowledge Context

Generated from \`knowledge/system-architecture.json\` and the current Graphify graph.

## Project
- Name: ${model.project.name}
- Working directory: \`${model.project.workingDirectory}\`
- Repository: ${model.project.repository}
- Production: ${model.project.productionUrl}
- Graphify: ${stats.nodes} nodes / ${stats.edges} relationships / ${stats.communities} communities
- Generated: ${generatedAt}

## Required workflow
1. Read \`PROJECT_PROGRESS.md\`, \`AI_HANDOFF.md\`, \`docs/AI_KNOWLEDGE_SYSTEM.md\`, and Obsidian \`70_AI作業環境/00_AI_START_HERE.md\`.
2. Search durable knowledge with \`npm run knowledge:search -- "<task or topic>"\`.
3. Run \`npm run knowledge:check\`.
4. Investigate with Graphify first: \`graphify query\`, \`graphify path\`, \`graphify explain\`.
5. Read only the required source ranges. Directly inspect SQL/RLS/triggers, CSS, config, and runtime service boundaries when relevant.
6. Implement and run build/static checks/tests plus real UI verification when applicable.
7. Write durable rationale/results to the relevant manual Obsidian note and \`PROJECT_PROGRESS.md\`.
8. After structural changes run \`npm run knowledge:update\`, then \`npm run knowledge:check\`.

## Source priority
| Rank | Source | Use | Warning |
|---:|---|---|---|
${sourcePriorityTable}

## Security boundary
Never place env files, private keys, service-role keys, SNS tokens, production personal data, post bodies, or uploaded files into Graphify, Obsidian, Git, screenshots, or chat.
`;

const aiStart = `---
type: ai-entrypoint
project: ${model.project.name}
generated: ${generatedAt}
graphify_nodes: ${stats.nodes}
graphify_edges: ${stats.edges}
---

# AI START HERE — ${model.project.name}

AIがこのアプリを編集するときの開始ページです。会話コンテキストだけに頼らず、GraphifyとObsidianから必要な知識を復元します。

## 作業開始（必須）
1. Git作業コピーで \`PROJECT_PROGRESS.md\`、\`AI_HANDOFF.md\`、\`docs/AI_KNOWLEDGE_SYSTEM.md\` を読む。
2. \`npm run knowledge:search -- "<依頼・症状・機能名>"\`で手書きObsidian知識を検索。
3. \`npm run knowledge:check\` でGraphify・環境図・Vaultの同期状態を確認。
4. このVaultの [[00_HOME]]、関連する設計・運用・障害・機能ノートを読む。
5. コードは最初にGraphifyで調査する。

\`\`\`bash
graphify query "<自然言語の質問>"
graphify path "<A>" "<B>"
graphify explain "<関数名>"
\`\`\`

Graphifyで対象を絞った後だけ、必要なソース範囲を読む。SQL/RLS/trigger、CSS、Docker/config、Supabase/HTTP/Cloud Run間の実行時接続は該当ファイルを直接確認する。

## 環境図
- [[01_システム環境図]]
- [[02_AI知識循環]]
- [[03_情報源と更新ルール]]
- [[04_AI作業チェックリスト]]
- [[05_Graphify_Obsidianブリッジ]]
- Obsidian Canvas: \`runtime-system.canvas\` / \`ai-knowledge-loop.canvas\`
- Web表示: 管理画面「システムマップ」→「環境図」

## 作業終了（必須）
1. build・lint・test・実画面確認を実施。
2. \`PROJECT_PROGRESS.md\`と関連する手書きObsidianノートを更新。
3. 構造変更があれば \`npm run knowledge:update\`。
4. \`npm run knowledge:check\` と \`git diff --check\`。
5. commit/push、Dropboxソースミラー同期、公開確認。

## 書き分け
- **90_Graphify**: 自動生成。手編集しない。
- **10〜70の手書きノート**: 設計意図・意思決定・運用・障害・機能知識を保存。
- **会話だけに残さない**: 次回も必要な情報は必ず手書きノートまたは進行記録へ書き戻す。
`;

const runtimeDoc = `# システム環境図

この図は利用者のブラウザからSupabase、Cloud Run、GitHub Pagesまでの実行・配信経路です。

\`\`\`mermaid
${mermaid("runtime")}
\`\`\`

## セキュリティ境界
- ブラウザにはSupabase publishable keyだけを置く。
- 認可の正本はPostgres RLS。user_metadataを認可に使わない。
- SNS秘密情報はsocial-integration-secrets Edge Function経由。
- worker用secretはGoogle Secret Manager、dispatcher用service accountはSupabase Secrets。
- Storageは非公開で、認証またはserver-side資格情報を使う。
`;

const knowledgeDoc = `# AI知識循環

AIがGraphifyとObsidianを組み合わせて開発を進める環境図です。

\`\`\`mermaid
${mermaid("knowledge")}
\`\`\`

## 役割分担
- **Graphify**: 現在のコード構造、import/call、関連ファイルの索引。
- **Obsidian**: なぜそうしたか、運用方法、障害、機能仕様の永続知識。
- **Git作業コピー**: 実装とテストの正本。
- **AI**: 情報源を結び、実装後に知識を戻す。

## 原則
GraphifyだけではSQL/RLSや外部サービス境界を完全に表せず、Obsidianだけでは現在コードの事実を保証できない。両方を使い、最後はソースと実環境で検証する。
`;

const sourceDoc = `# 情報源と更新ルール

## 優先順位
| 順位 | 情報源 | 用途 | 注意 |
|---:|---|---|---|
${sourcePriorityTable}

## 自動更新
\`\`\`bash
npm run knowledge:update
npm run knowledge:check
npm run knowledge:search -- "<タスク・症状・機能名>"
\`\`\`

- \`knowledge:update\`: Graphify、管理画面用マップ、環境図、Obsidian Graphifyノート、AI向け文書を更新。
- \`knowledge:check\`: Graphify manifestのハッシュ、環境図生成物、Vault必須ファイル、秘密値マーカーを検査。
- \`knowledge:search\`: 手書きObsidianノートを検索。通常は自動生成の\`90_Graphify\`を除外し、必要なら\`--all\`を付ける。

## 手動書き戻し
自動生成では設計意図・判断・障害経緯は作れないため、作業後に関連する手書きノートを更新する。
`;

const checklistDoc = `# AI作業チェックリスト

## 開始
- [ ] \`PROJECT_PROGRESS.md\` と \`AI_HANDOFF.md\` を読んだ
- [ ] [[00_AI_START_HERE]] と関連ノートを読んだ
- [ ] \`git status --short\`、branch、HEADを確認した
- [ ] \`npm run knowledge:check\` が通った
- [ ] Graphify query/path/explainで対象を特定した

## 実装
- [ ] 該当ソースだけを精読した
- [ ] SQL/RLS・CSS・設定・外部サービス境界を必要に応じて直接確認した
- [ ] 既存の未commit変更を上書きしていない
- [ ] 秘密値・個人データを出力していない

## 終了
- [ ] build / lint / testが成功した
- [ ] UI変更は実画面で確認した
- [ ] media worker変更時は \`npm run worker:docker:check\` でlinux/amd64・FFmpeg/libx264・非root・crop-plan・実MP4変換を検証した（他コンテナは変更しない）
- [ ] \`PROJECT_PROGRESS.md\` を更新した
- [ ] 関連する手書きObsidianノートへ書き戻した
- [ ] 構造変更後に \`npm run knowledge:update\` を実行した
- [ ] \`npm run knowledge:check\` と \`git diff --check\` が成功した
- [ ] commit / push / Dropboxミラー同期 / 公開確認を行った
`;

const bridgeDoc = `# Graphify × Obsidian ブリッジ

Graphifyのコードノードと、Obsidianの手書き知識を同じ入口から辿るための対応表です。

## 調査方法
1. Obsidianの背景知識を検索:
   \`npm run knowledge:search -- "<要件・症状・機能名>"\`
2. Graphifyでコード構造を検索:
   \`graphify query "<コード上で知りたいこと>"\`
3. 関連ノードを詳細確認:
   \`graphify explain "<ノード>"\` / \`graphify path "<A>" "<B>"\`
4. 該当ソースを直接確認し、作業後に手書きノートへ結果を書き戻す。

## 主要領域
| 領域 | 手書き知識 | Graphifyノード |
|---|---|---|
| 通常運用画面 | [[10_アプリ別/Instatic TalksX/10_プロジェクト概要/概要|概要]] | [[10_アプリ別/Instatic TalksX/90_Graphify/SocialConsole()|SocialConsole()]] |
| 管理者画面 | [[10_アプリ別/Instatic TalksX/60_機能別知識/管理者権限|管理者権限]] | [[10_アプリ別/Instatic TalksX/90_Graphify/AdminConsole()|AdminConsole()]] |
| 動画クロップ | [[10_アプリ別/Instatic TalksX/60_機能別知識/動画クロップ|動画クロップ]] | [[10_アプリ別/Instatic TalksX/90_Graphify/processJob()|processJob()]] / [[10_アプリ別/Instatic TalksX/90_Graphify/createCropPlan()|createCropPlan()]] |
| Cloud Run dispatch | [[10_アプリ別/Instatic TalksX/20_設計/アーキテクチャ|アーキテクチャ]] | [[10_アプリ別/Instatic TalksX/90_Graphify/mediaJobsFunction|mediaJobsFunction]] |
| GitHub Pages | [[10_アプリ別/Instatic TalksX/30_運用手順/デプロイ手順|デプロイ手順]] | [[10_アプリ別/Instatic TalksX/90_Graphify/appPath()|appPath()]] |
| 知識更新 | [[10_アプリ別/Instatic TalksX/70_AI作業環境/03_情報源と更新ルール|情報源と更新ルール]] | [[10_アプリ別/Instatic TalksX/90_Graphify/update-knowledge-vault.sh|update-knowledge-vault.sh]] |

## Graphifyに出ない領域
- SQL migration / RLS / trigger: \`supabase/migrations/\`を直接確認。
- CSS: \`app/globals.css\`を直接確認。
- Supabase / HTTP / Cloud Run間の実行時接続: [[01_システム環境図]]と該当実装を併用。
- 設計理由や過去の障害: 手書きObsidianノートを優先。
`;

const systemDoc = `# Graphify × Obsidian × AI Knowledge System

This repository uses one structured architecture model to keep the public environment diagram, Obsidian knowledge vault, and AI startup context aligned.

## Canonical files
- \`knowledge/system-architecture.json\`: runtime and knowledge-flow architecture model.
- \`scripts/generate-knowledge-system.mjs\`: generates all environment views.
- \`AGENTS.md\`: repository-level AI operating rules.
- \`PROJECT_PROGRESS.md\` and \`AI_HANDOFF.md\`: current state and handoff history.

## Generated outputs
- \`public/system-map/environment.html\`: interactive runtime and AI knowledge environment diagram.
- \`public/system-map/graph-stats.json\`: Graphify statistics consumed by the admin UI.
- \`docs/AI_CONTEXT.md\`: concise machine-readable startup context.
- Obsidian \`70_AI作業環境/\`: startup note, diagrams, rules, checklist, and Canvas files.
- Obsidian \`90_Graphify/\`: Graphify node and relationship notes.

## Development loop
1. Read rules and relevant Obsidian notes.
2. Search durable knowledge with \`npm run knowledge:search -- "<topic>"\`.
3. Check freshness with \`npm run knowledge:check\`.
4. Query Graphify before broad source reading.
5. Verify exact behavior in source and live services.
6. Implement, test, and deploy.
7. Write durable knowledge back to manual Obsidian notes.
8. Run \`npm run knowledge:update\` after structural changes.

## Why both are required
- Graphify answers **where and how code is connected now**.
- Obsidian answers **why it exists, how it is operated, and what happened before**.
- Neither replaces source verification, tests, or live-environment checks.

## Update and verification
\`\`\`bash
npm run knowledge:update
npm run knowledge:check
\`\`\`
`;

const graphStats = {
  ...stats,
  generatedAt,
  modelVersion: model.version,
};

await Promise.all([
  writeFile(
    join(publicDir, "environment.html"),
    architectureHtml.replace(/[\t ]+$/gm, ""),
  ),
  writeFile(
    join(publicDir, "graph-stats.json"),
    `${JSON.stringify(graphStats, null, 2)}\n`,
  ),
  writeFile(join(docsDir, "AI_CONTEXT.md"), aiContext),
  writeFile(join(docsDir, "AI_KNOWLEDGE_SYSTEM.md"), systemDoc),
  writeFile(join(vaultAiDir, "00_AI_START_HERE.md"), aiStart),
  writeFile(join(vaultAiDir, "01_システム環境図.md"), runtimeDoc),
  writeFile(join(vaultAiDir, "02_AI知識循環.md"), knowledgeDoc),
  writeFile(join(vaultAiDir, "03_情報源と更新ルール.md"), sourceDoc),
  writeFile(join(vaultAiDir, "04_AI作業チェックリスト.md"), checklistDoc),
  writeFile(join(vaultAiDir, "05_Graphify_Obsidianブリッジ.md"), bridgeDoc),
  writeFile(
    join(vaultAiDir, "runtime-system.canvas"),
    `${JSON.stringify(canvasForView("runtime"), null, 2)}\n`,
  ),
  writeFile(
    join(vaultAiDir, "ai-knowledge-loop.canvas"),
    `${JSON.stringify(canvasForView("knowledge"), null, 2)}\n`,
  ),
]);

const architectureHash = createHash("sha256")
  .update(JSON.stringify(model))
  .digest("hex");
await writeFile(
  join(publicDir, "knowledge-system-manifest.json"),
  `${JSON.stringify(
    {
      generatedAt,
      architectureHash,
      graph: stats,
      outputs: [
        "public/system-map/environment.html",
        "public/system-map/graph-stats.json",
        "docs/AI_CONTEXT.md",
        "docs/AI_KNOWLEDGE_SYSTEM.md",
        "Obsidian:70_AI作業環境/00_AI_START_HERE.md",
        "Obsidian:70_AI作業環境/05_Graphify_Obsidianブリッジ.md",
        "Obsidian:70_AI作業環境/runtime-system.canvas",
        "Obsidian:70_AI作業環境/ai-knowledge-loop.canvas",
      ],
    },
    null,
    2,
  )}\n`,
);

console.log(
  `[knowledge] generated environment system (${stats.nodes} nodes / ${stats.edges} relationships / ${stats.communities} communities)`,
);
console.log(`[knowledge] Obsidian AI workspace: ${vaultAiDir}`);
