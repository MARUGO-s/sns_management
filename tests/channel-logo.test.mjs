import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("SNS logos render original assets under both local and GitHub Pages paths", async () => {
  const previousBasePath = process.env.NEXT_PUBLIC_APP_BASE_PATH;
  try {
    for (const basePath of ["", "/sns_management"]) {
      process.env.NEXT_PUBLIC_APP_BASE_PATH = basePath;
      const server = await createServer({
        root: fileURLToPath(new URL("..", import.meta.url)),
        configFile: false,
        appType: "custom",
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      });
      try {
        const { ChannelLogo, ChannelLabel, channelLogos } =
          await server.ssrLoadModule("/app/channel-logo.tsx");
        assert.deepEqual(Object.keys(channelLogos), ["instagram", "tiktok", "x", "threads"]);
        for (const [channel, { src, label }] of Object.entries(channelLogos)) {
          const html = renderToStaticMarkup(createElement(ChannelLogo, { channel }));
          assert.ok(html.includes(`src="${basePath}${src}"`));
          assert.match(html, /alt=""/); // The adjacent channel name is the accessible label.
          assert.match(html, /aria-hidden="true"/);
          const badge = renderToStaticMarkup(createElement(ChannelLabel, { channel }));
          assert.ok(badge.includes(label));
          assert.match(badge, /channel-logo--small/);
        }
        assert.equal(renderToStaticMarkup(createElement(ChannelLabel, { channel: "unknown" })), "unknown");
        assert.equal(renderToStaticMarkup(createElement(ChannelLabel, { channel: "constructor" })), "constructor");
      } finally {
        await server.close();
      }
    }
  } finally {
    if (previousBasePath === undefined) delete process.env.NEXT_PUBLIC_APP_BASE_PATH;
    else process.env.NEXT_PUBLIC_APP_BASE_PATH = previousBasePath;
  }
});

test("all channel selectors and administrator lists use shared image logos", async () => {
  const [consoleSource, adminSource, styles] = await Promise.all([
    readFile(new URL("../app/social-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(consoleSource, /channel\.label\.slice/);
  assert.equal((consoleSource.match(/<ChannelLogo\b/g) ?? []).length, 7);
  assert.equal((adminSource.match(/<ChannelLabel\b/g) ?? []).length, 2);
  assert.match(styles, /object-fit: contain/);
  assert.doesNotMatch(styles, /\.admin-channel-list span\b/);
});

test("provided logo files are preserved byte-for-byte", async () => {
  const hashes = {
    "instagram.png": "7709e31666f5968c3161753299883df235b4845f1c4584a8f3a7a5a85e99cd71",
    "tiktok.avif": "dc1684580e92b90dcae0550c40cf45f1bb976383fe5ce016dbb239450b2efb7d",
    "x.jpg": "b029276931bb019a67954ad2169606fd2359849f48a5f9264179cb44a35d7710",
    "threads.avif": "5a545b3d91eae9189d2b73fa86e8d9acc066117e82acefd82207309d106fd44e",
  };
  for (const [file, expected] of Object.entries(hashes)) {
    const bytes = await readFile(new URL(`../public/logos/${file}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected);
  }
});
