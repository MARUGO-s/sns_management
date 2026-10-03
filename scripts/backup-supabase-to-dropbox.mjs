import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const backupRoot = resolve(
  process.env.DROPBOX_BACKUP_DIR ||
    "/Users/yoshito/Library/CloudStorage/Dropbox/web/instatic-talksx-backups"
);
const bucketName = "social-post-files";
const tables = [
  "social_workspaces",
  "social_workspace_members",
  "social_posts",
  "social_post_channels",
  "social_post_files",
  "social_integrations",
  "social_integration_secrets",
  "social_admin_users",
  "social_user_profiles",
  "social_audit_logs",
  "social_stores",
  "social_media_jobs",
];

if (!supabaseUrl || !secretKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required."
  );
}

const headers = {
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
};

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response;
}

async function listStorageFiles(prefix = "") {
  const response = await supabaseFetch(`/storage/v1/object/list/${bucketName}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prefix,
      limit: 1000,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    }),
  });
  const entries = await response.json();
  const files = [];

  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) {
      files.push(name);
    } else {
      files.push(...(await listStorageFiles(name)));
    }
  }

  return files;
}

function encodeStoragePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = join(backupRoot, timestamp);
const tableDir = join(backupDir, "tables");
const fileDir = join(backupDir, "files");
await mkdir(tableDir, { recursive: true });
await mkdir(fileDir, { recursive: true });

const manifest = {
  createdAt: new Date().toISOString(),
  supabaseUrl,
  tables: [],
  files: [],
};

for (const table of tables) {
  const response = await supabaseFetch(`/rest/v1/${table}?select=*`);
  const rows = await response.json();
  await writeFile(join(tableDir, `${table}.json`), `${JSON.stringify(rows, null, 2)}\n`);
  manifest.tables.push({ table, rows: rows.length });
}

const storageFiles = await listStorageFiles();
for (const storagePath of storageFiles) {
  const response = await supabaseFetch(
    `/storage/v1/object/authenticated/${bucketName}/${encodeStoragePath(storagePath)}`
  );
  const target = join(fileDir, storagePath);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  manifest.files.push(storagePath);
}

await writeFile(join(backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const backups = await readdir(backupRoot, { withFileTypes: true });
console.log(`Backup complete: ${backupDir}`);
console.log(`Tables: ${manifest.tables.length}, files: ${manifest.files.length}`);
console.log(`Existing backup folders: ${backups.filter((entry) => entry.isDirectory()).length}`);
