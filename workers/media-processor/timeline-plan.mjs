const epsilon = 0.001;
const minimumCutSeconds = 0.1;
const minimumOutputSeconds = 0.5;
const maximumCuts = 32;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rounded(value) {
  return Math.round(value * 1000) / 1000;
}

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number`);
  }
  return value;
}

export function createTimelinePlan(durationSeconds, config = {}) {
  const duration = finiteNumber(durationSeconds, "Video duration");
  if (duration <= 0) throw new Error("Video duration must be positive");

  const configuredStart =
    config.startTime == null
      ? 0
      : finiteNumber(config.startTime, "Start time");
  if (configuredStart < 0) throw new Error("Start time cannot be negative");
  const startTime = rounded(clamp(configuredStart, 0, duration));
  const endTime = rounded(
    clamp(
      config.endTime == null
        ? duration
        : finiteNumber(config.endTime, "End time"),
      0,
      duration,
    ),
  );
  if (endTime - startTime < minimumOutputSeconds) {
    throw new Error("The selected start and end must keep at least 0.5 seconds");
  }

  if (config.cuts != null && !Array.isArray(config.cuts)) {
    throw new Error("Cuts must be an array");
  }
  const rawCuts = config.cuts ?? [];
  if (rawCuts.length > maximumCuts) {
    throw new Error(`A maximum of ${maximumCuts} cut ranges is supported`);
  }

  const clippedCuts = [];
  for (const [index, cut] of rawCuts.entries()) {
    if (!cut || typeof cut !== "object") {
      throw new Error(`Cut ${index + 1} is invalid`);
    }
    const rawStart = finiteNumber(cut.start, `Cut ${index + 1} start`);
    const rawEnd = finiteNumber(cut.end, `Cut ${index + 1} end`);
    if (rawStart < 0 || rawEnd - rawStart < minimumCutSeconds - epsilon) {
      throw new Error(`Cut ${index + 1} must be at least 0.1 seconds`);
    }

    const start = rounded(Math.max(startTime, rawStart));
    const end = rounded(Math.min(endTime, rawEnd));
    if (end - start >= minimumCutSeconds - epsilon) {
      clippedCuts.push({ start, end });
    }
  }

  clippedCuts.sort((left, right) =>
    left.start === right.start
      ? left.end - right.end
      : left.start - right.start,
  );

  const cuts = [];
  for (const cut of clippedCuts) {
    const previous = cuts.at(-1);
    if (previous && cut.start <= previous.end + epsilon) {
      previous.end = rounded(Math.max(previous.end, cut.end));
    } else {
      cuts.push({ ...cut });
    }
  }

  const segments = [];
  let cursor = startTime;
  for (const cut of cuts) {
    if (cut.start - cursor > epsilon) {
      segments.push({ start: rounded(cursor), end: rounded(cut.start) });
    }
    cursor = Math.max(cursor, cut.end);
  }
  if (endTime - cursor > epsilon) {
    segments.push({ start: rounded(cursor), end: rounded(endTime) });
  }

  const outputDuration = rounded(
    segments.reduce((total, segment) => total + segment.end - segment.start, 0),
  );
  if (outputDuration < minimumOutputSeconds - epsilon) {
    throw new Error("Timeline edits must leave at least 0.5 seconds of video");
  }

  return {
    startTime,
    endTime,
    cuts,
    segments,
    removedDuration: rounded(duration - outputDuration),
    outputDuration,
    sourceDuration: rounded(duration),
  };
}

export function createTimelineFilter(plan, cropFilter, hasAudio) {
  if (!plan?.segments?.length) throw new Error("Timeline has no output segments");
  if (typeof cropFilter !== "string" || !cropFilter) {
    throw new Error("Crop filter is required");
  }

  const chains = [];
  for (const [index, segment] of plan.segments.entries()) {
    chains.push(
      `[0:v:0]trim=start=${segment.start}:end=${segment.end},` +
        `setpts=PTS-STARTPTS,${cropFilter}[v${index}]`,
    );
    if (hasAudio) {
      chains.push(
        `[0:a:0]atrim=start=${segment.start}:end=${segment.end},` +
          `asetpts=PTS-STARTPTS[a${index}]`,
      );
    }
  }

  if (plan.segments.length === 1) {
    return {
      filter: chains.join(";"),
      videoMap: "[v0]",
      audioMap: hasAudio ? "[a0]" : null,
    };
  }

  const concatInputs = plan.segments
    .map((_, index) => `[v${index}]${hasAudio ? `[a${index}]` : ""}`)
    .join("");
  if (hasAudio) {
    chains.push(
      `${concatInputs}concat=n=${plan.segments.length}:v=1:a=1[vout][aout]`,
    );
  } else {
    chains.push(
      `${concatInputs}concat=n=${plan.segments.length}:v=1:a=0[vout]`,
    );
  }

  return {
    filter: chains.join(";"),
    videoMap: "[vout]",
    audioMap: hasAudio ? "[aout]" : null,
  };
}
