import assert from "node:assert/strict";
import test from "node:test";
import { createCropPlan } from "./crop-plan.mjs";

test("creates a centered vertical crop for a landscape video", () => {
  const plan = createCropPlan(1920, 1080, {
    aspect: "9:16",
    positionX: 50,
    positionY: 50,
    zoom: 100,
  });

  assert.equal(plan.cropHeight, 1080);
  assert.equal(plan.cropWidth, 606);
  assert.equal(plan.x, 656);
  assert.equal(plan.y, 0);
  assert.equal(plan.outputWidth, 1080);
  assert.equal(plan.outputHeight, 1920);
});

test("clamps zoom and crop positions to safe values", () => {
  const plan = createCropPlan(1080, 1920, {
    aspect: "1:1",
    positionX: -20,
    positionY: 140,
    zoom: 400,
  });

  assert.equal(plan.cropWidth, 540);
  assert.equal(plan.cropHeight, 540);
  assert.equal(plan.x, 0);
  assert.equal(plan.y, 1380);
  assert.match(plan.filter, /^crop=540:540:0:1380,/);
});
