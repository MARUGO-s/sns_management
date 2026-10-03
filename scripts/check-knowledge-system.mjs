import { createHash } from "node:crypto";
import {
  access,
  readFile,
  readdir,
  stat,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const projectDir = fileURLToPath(new URL("../", import.meta.url));
const vaultAppDir =
  process.env.KNOWLEDGE_VAULT_APP_DIR ??
  "/Users/yoshito/Library/CloudStorage/Dropbox/web/アプリ知識/10_アプリ別/Instatic TalksX";
const vaultGraphifyDir =
  process.env.KNOWLEDGE_VAULT_GRAPHIFY_DIR ??
  join(vaultAppDir, "90_Graphify");
const vaultAiDir = join(vaultAppDir, "70_AI作業環境");
const errors = [];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function md5(path) {
  const content = await readFile(path);
  return createHash("md5").update(content).digest("hex");
}

async function collectFiles(directory) {
  const results = [];
  if (!(await exists(directory))) return results;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await collectFiles(path)));
    else results.push(path);
  }
  return results;
}

const requiredRepoFiles = [
  "AGENTS.md",
  "knowledge/system-architecture.json",
  "docs/AI_CONTEXT.md",
  "docs/AI_KNOWLEDGE_SYSTEM.md",
  "public/system-map/graph.html",
  "public/system-map/environment.html",
  "public/system-map/graph-stats.json",
  "public/system-map/knowledge-system-manifest.json",
];
for (const file of requiredRepoFiles) {
  if (!(await exists(join(projectDir, file)))) errors.push(`missing repo file: ${file}`);
}

const requiredVaultFiles = [
  "00_AI_START_HERE.md",
  "01_システム環境図.md",
  "02_AI知識循環.md",
  "03_情報源と更新ルール.md",
  "04_AI作業チェックリスト.md",
  "05_Graphify_Obsidianブリッジ.md",
  "runtime-system.canvas",
  "ai-knowledge-loop.canvas",
];
for (const file of requiredVaultFiles) {
  if (!(await exists(join(vaultAiDir, file)))) errors.push(`missing vault file: ${file}`);
}
if (!(await exists(join(vaultGraphifyDir, "graph.canvas")))) {
  errors.push("missing vault Graphify canvas: 90_Graphify/graph.canvas");
}

const manifestPath = join(projectDir, "graphify-out/manifest.json");
if (!(await exists(manifestPath))) {
  errors.push("missing graphify-out/manifest.json; run npm run knowledge:update");
} else {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const [file, entry] of Object.entries(manifest)) {
    const path = join(projectDir, file);
    if (!(await exists(path))) {
      errors.push(`Graphify manifest references missing file: ${file}`);
      continue;
    }
    const currentHash = await md5(path);
    if (entry.ast_hash && currentHash !== entry.ast_hash) {
      errors.push(`Graphify is stale for ${file}`);
    }
  }
}

if (await exists(join(projectDir, "public/system-map/graph-stats.json"))) {
  const graph = JSON.parse(
    await readFile(join(projectDir, "graphify-out/graph.json"), "utf8"),
  );
  const stats = JSON.parse(
    await readFile(join(projectDir, "public/system-map/graph-stats.json"), "utf8"),
  );
  const communities = new Set(
    (graph.nodes ?? [])
      .map((node) => node.community)
      .filter((community) => community !== undefined && community !== null),
  ).size;
  if (
    stats.nodes !== (graph.nodes?.length ?? 0) ||
    stats.edges !== (graph.links?.length ?? 0) ||
    stats.communities !== communities
  ) {
    errors.push("public graph-stats.json does not match graphify-out/graph.json");
  }
}

const secretPattern =
  /service_role|supabase_secret_key|-----BEGIN [A-Z ]*PRIVATE KEY-----|client_secret|sb_secret/i;
for (const file of await collectFiles(vaultAppDir)) {
  const info = await stat(file);
  if (info.size > 2_000_000) continue;
  const content = await readFile(file, "utf8").catch(() => "");
  if (secretPattern.test(content)) {
    errors.push(`potential secret marker in vault: ${relative(vaultAppDir, file)}`);
  }
}

const gitStatus = spawnSync("git", ["status", "--short"], {
  cwd: projectDir,
  encoding: "utf8",
});
if (gitStatus.status !== 0) {
  errors.push(`git status failed: ${gitStatus.stderr.trim()}`);
}

if (errors.length) {
  console.error("[knowledge] check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("[knowledge] check passed");
console.log(`- Graphify manifest hashes are current`);
console.log(`- Repository environment outputs are present`);
console.log(`- Obsidian AI workspace and Graphify canvas are present`);
console.log(`- Vault secret marker scan is clean`);
if (gitStatus.stdout.trim()) {
  console.log("- Git working tree has changes (expected during active work)");
}
