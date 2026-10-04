import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Google auth stays opt-in outside the configured production build", () => {
  for (const [flag, expected] of [[undefined, false], ["false", false], ["true", true]]) {
    const env = { ...process.env };
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    delete env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (flag === undefined) delete env.NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED;
    else env.NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED = flag;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--input-type=module", "-e",
      `import { googleAuthEnabled, supabase } from ${JSON.stringify(new URL("../app/lib/supabase.ts", import.meta.url).href)};
       console.log(JSON.stringify({ googleAuthEnabled, configured: supabase !== null }));`,
    ], { env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { googleAuthEnabled: expected, configured: false });
  }
});

test("Pages explicitly enables Google without putting the OAuth secret in the frontend", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy-github-pages.yml", import.meta.url), "utf8");
  assert.match(workflow, /NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED: "true"/);
  assert.doesNotMatch(workflow, /NEXT_PUBLIC_\w*(?:CLIENT_SECRET|GOOGLE_SECRET)/);
  const source = await readFile(new URL("../app/social-console.tsx", import.meta.url), "utf8");
  assert.match(source, /provider: "google",\s*options: \{\s*redirectTo: getAuthRedirectUrl\(\),\s*skipBrowserRedirect: true/s);
  assert.match(source, /return new URL\(normalizedPath, window\.location\.origin\)\.toString\(\)/);
  assert.match(source, /googleAuthEnabled &&/);
  assert.match(source, /signInWithPassword/);
});
