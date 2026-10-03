import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const outputDirectory = fileURLToPath(new URL("../dist/client", import.meta.url));
const basePath = process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "";
const normalizedBasePath = basePath.replace(/^\/+|\/+$/g, "");

if (!normalizedBasePath) {
  throw new Error("NEXT_PUBLIC_APP_BASE_PATH is required for GitHub Pages output.");
}

const prefixes = [
  "assets/",
  "favicon.svg",
  "file.svg",
  "globe.svg",
  "og.png",
  "window.svg",
  "system-map/",
];

const expression = new RegExp(
  `/(?:${prefixes.map((prefix) => prefix.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")).join("|")})`,
  "g",
);

async function rewriteDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      await rewriteDirectory(entryPath);
      continue;
    }

    if (!/\.(?:html|rsc)$/.test(entry.name)) {
      continue;
    }

    const source = await readFile(entryPath, "utf8");
    const rewritten = source.replace(expression, `/${normalizedBasePath}$&`);

    if (rewritten !== source) {
      await writeFile(entryPath, rewritten);
    }
  }
}

await rewriteDirectory(outputDirectory);
