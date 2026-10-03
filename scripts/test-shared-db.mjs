import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

const container = `codex-sns-sql-test-${randomUUID().slice(0, 8)}`;
const image = "postgres:17-alpine";
function docker(args, options = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Docker failed");
  return result.stdout;
}
try {
  docker(["run", "--detach", "--rm", "--name", container,
    "--env", "POSTGRES_HOST_AUTH_METHOD=trust", image]);
  let ready = false;
  // Image initialization starts a temporary socket-only server before the
  // final server. TCP readiness avoids mistaking that temporary server for
  // the final one and racing its shutdown in a fresh CI container.
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = spawnSync("docker", ["exec", container, "pg_isready",
      "-h", "127.0.0.1", "-U", "postgres"]);
    if (result.status === 0) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Temporary Postgres did not start");
  const migrations = readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort();
  const sql = ["tests/shared-db-fixture.sql", ...migrations.map((file) => `supabase/migrations/${file}`),
    "tests/shared-db-assertions.sql"].map((file) => readFileSync(file, "utf8")).join("\n");
  console.log(docker(["exec", "-i", container, "psql", "-h", "127.0.0.1",
    "-U", "postgres", "-X", "-q",
    "--single-transaction", "-v", "ON_ERROR_STOP=1", "-f", "-"], { input: sql }));
} finally {
  spawnSync("docker", ["stop", container], { encoding: "utf8" });
}
