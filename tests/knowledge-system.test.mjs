import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const architectureUrl = new URL(
  "../knowledge/system-architecture.json",
  import.meta.url,
);

test("knowledge architecture has valid views, unique nodes, and valid edges", async () => {
  const architecture = JSON.parse(await readFile(architectureUrl, "utf8"));
  const viewIds = new Set(architecture.views.map((view) => view.id));
  assert.deepEqual(
    [...viewIds].sort(),
    ["knowledge", "runtime"],
    "runtime and AI knowledge views are required",
  );

  const nodeIds = architecture.nodes.map((node) => node.id);
  assert.equal(
    new Set(nodeIds).size,
    nodeIds.length,
    "knowledge architecture node ids must be unique",
  );
  const nodes = new Map(architecture.nodes.map((node) => [node.id, node]));

  for (const node of architecture.nodes) {
    assert.ok(viewIds.has(node.view), `unknown node view: ${node.view}`);
    assert.ok(node.label, `node ${node.id} needs a label`);
    assert.ok(node.description, `node ${node.id} needs a description`);
    assert.ok(node.width > 0 && node.height > 0, `node ${node.id} needs dimensions`);
  }

  for (const edge of architecture.edges) {
    assert.ok(nodes.has(edge.from), `unknown edge source: ${edge.from}`);
    assert.ok(nodes.has(edge.to), `unknown edge target: ${edge.to}`);
    assert.equal(
      nodes.get(edge.from).view,
      edge.view,
      `edge ${edge.from} -> ${edge.to} crosses an undeclared view`,
    );
    assert.equal(
      nodes.get(edge.to).view,
      edge.view,
      `edge ${edge.from} -> ${edge.to} crosses an undeclared view`,
    );
    assert.ok(edge.label, `edge ${edge.from} -> ${edge.to} needs a label`);
  }
});

test("generated knowledge outputs expose Graphify, Obsidian, and AI workflow", async () => {
  const [
    environment,
    statsSource,
    publicManifest,
    aiContext,
    systemDoc,
    agentRules,
    packageSource,
  ] =
    await Promise.all([
      readFile(
        new URL("../public/system-map/environment.html", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../public/system-map/graph-stats.json", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../public/system-map/knowledge-system-manifest.json",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../docs/AI_CONTEXT.md", import.meta.url), "utf8"),
      readFile(
        new URL("../docs/AI_KNOWLEDGE_SYSTEM.md", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
    ]);

  const stats = JSON.parse(statsSource);
  assert.ok(stats.nodes > 0);
  assert.ok(stats.edges > 0);
  assert.ok(stats.communities > 0);
  assert.match(environment, /アプリ実行・デプロイ環境/);
  assert.match(environment, /AI・Graphify・Obsidian知識循環/);
  assert.match(environment, new RegExp(`${stats.nodes} Graphify nodes`));
  assert.doesNotMatch(publicManifest, /\/Users\//);
  assert.match(publicManifest, /Obsidian:70_AI作業環境/);
  assert.match(aiContext, /knowledge:search/);
  assert.match(aiContext, /knowledge:check/);
  assert.match(systemDoc, /Graphify answers/);
  assert.match(systemDoc, /Obsidian answers/);
  assert.match(agentRules, /Required startup sequence/);
  assert.match(agentRules, /Graphify-first investigation/);
  assert.match(packageSource, /"knowledge:update"/);
  assert.match(packageSource, /"knowledge:check"/);
  assert.match(packageSource, /"knowledge:search"/);
  assert.match(packageSource, /"worker:docker:check"/);
});
