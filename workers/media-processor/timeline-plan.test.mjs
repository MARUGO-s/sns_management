import assert from "node:assert/strict";
import test from "node:test";
import {
  createTimelineFilter,
  createTimelinePlan,
} from "./timeline-plan.mjs";

test("defaults old crop-only jobs to the full source duration", () => {
  const plan = createTimelinePlan(12.5, {});
  assert.deepEqual(plan.segments, [{ start: 0, end: 12.5 }]);
  assert.equal(plan.outputDuration, 12.5);
  assert.deepEqual(plan.cuts, []);
});

test("trims the ends and merges overlapping intermediate cuts", () => {
  const plan = createTimelinePlan(20, {
    startTime: 2,
    endTime: 18,
    cuts: [
      { start: 12, end: 15 },
      { start: 5, end: 8 },
      { start: 7.5, end: 10 },
      { start: 0, end: 3 },
      { start: 17, end: 22 },
    ],
  });

  assert.deepEqual(plan.cuts, [
    { start: 2, end: 3 },
    { start: 5, end: 10 },
    { start: 12, end: 15 },
    { start: 17, end: 18 },
  ]);
  assert.deepEqual(plan.segments, [
    { start: 3, end: 5 },
    { start: 10, end: 12 },
    { start: 15, end: 17 },
  ]);
  assert.equal(plan.outputDuration, 6);
  assert.equal(plan.removedDuration, 14);
});

test("rejects invalid, excessive, or empty timeline edits", () => {
  assert.throws(
    () => createTimelinePlan(10, { startTime: "1" }),
    /must be a number/,
  );
  assert.throws(
    () => createTimelinePlan(10, { startTime: -1 }),
    /cannot be negative/,
  );
  assert.throws(
    () => createTimelinePlan(10, { cuts: [{ start: null, end: 2 }] }),
    /must be a number/,
  );
  assert.throws(
    () => createTimelinePlan(10, { startTime: 9.8, endTime: 10 }),
    /at least 0.5 seconds/,
  );
  assert.throws(
    () => createTimelinePlan(10, { cuts: [{ start: 2, end: 2.05 }] }),
    /at least 0.1 seconds/,
  );
  assert.throws(
    () =>
      createTimelinePlan(10, {
        cuts: Array.from({ length: 33 }, (_, index) => ({
          start: index / 100,
          end: index / 100 + 0.1,
        })),
      }),
    /maximum of 32/,
  );
  assert.throws(
    () => createTimelinePlan(10, { cuts: [{ start: 0, end: 10 }] }),
    /leave at least 0.5 seconds/,
  );
  assert.throws(
    () =>
      createTimelinePlan(10, {
        cuts: [
          { start: 0, end: 6 },
          { start: 5, end: 9.6 },
        ],
      }),
    /leave at least 0.5 seconds/,
  );
});

test("creates concat filters for video with and without audio", () => {
  const plan = createTimelinePlan(10, {
    startTime: 1,
    endTime: 9,
    cuts: [{ start: 4, end: 6 }],
  });
  const withAudio = createTimelineFilter(plan, "scale=720:1280", true);
  assert.match(withAudio.filter, /\[0:v:0\]trim=start=1:end=4/);
  assert.match(withAudio.filter, /\[0:a:0\]atrim=start=6:end=9/);
  assert.match(withAudio.filter, /concat=n=2:v=1:a=1\[vout\]\[aout\]/);
  assert.equal(withAudio.videoMap, "[vout]");
  assert.equal(withAudio.audioMap, "[aout]");

  const videoOnly = createTimelineFilter(plan, "scale=720:1280", false);
  assert.doesNotMatch(videoOnly.filter, /atrim/);
  assert.match(videoOnly.filter, /concat=n=2:v=1:a=0\[vout\]/);
  assert.equal(videoOnly.audioMap, null);
});
