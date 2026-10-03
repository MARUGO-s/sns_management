import assert from "node:assert/strict";
import test from "node:test";
import { createEncodingPlan } from "./encoding-plan.mjs";

test("keeps short videos at the normal quality ceiling", () => {
  const plan = createEncodingPlan(60, "9:16");
  assert.equal(plan.videoKbps, 2600);
  assert.equal(plan.output, null);
});

test("fits a 9 minute 16 second video below the 50 MB storage limit", () => {
  const plan = createEncodingPlan(556, "9:16");
  const estimatedBytes =
    ((plan.videoKbps + plan.audioKbps) * 1000 * 556) / 8;
  assert.ok(estimatedBytes < 50 * 1024 * 1024);
  assert.deepEqual(plan.output, { width: 720, height: 1280 });
});

test("rejects videos that cannot fit without unusably low bitrate", () => {
  assert.throws(
    () => createEncodingPlan(60 * 60, "16:9"),
    /too long/,
  );
});
