const mebibyte = 1024 * 1024;
const defaultFileSizeLimit = 50 * mebibyte;
const targetFileSize = 46 * mebibyte;
const audioKbps = 96;
const minimumVideoKbps = 280;
const maximumVideoKbps = 2600;

const compactOutputByAspect = {
  "1:1": { width: 720, height: 720 },
  "4:5": { width: 720, height: 900 },
  "9:16": { width: 720, height: 1280 },
  "16:9": { width: 1280, height: 720 },
};

export function createEncodingPlan(
  durationSeconds,
  aspect,
  fileSizeLimit = defaultFileSizeLimit,
) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Invalid video duration");
  }
  if (!compactOutputByAspect[aspect]) {
    throw new Error("Unsupported crop aspect");
  }
  if (!Number.isFinite(fileSizeLimit) || fileSizeLimit <= 0) {
    throw new Error("Invalid file size limit");
  }

  const safeTargetBytes = Math.min(targetFileSize, fileSizeLimit * 0.92);
  const availableKbps = Math.floor(
    ((safeTargetBytes * 8) / durationSeconds / 1000) * 0.94,
  );
  const videoKbps = Math.min(maximumVideoKbps, availableKbps - audioKbps);
  if (videoKbps < minimumVideoKbps) {
    throw new Error(
      "Video is too long to fit within the current 50 MB processing limit",
    );
  }

  return {
    audioKbps,
    videoKbps,
    maxrateKbps: videoKbps,
    bufsizeKbps: videoKbps * 2,
    output: videoKbps < 1200 ? compactOutputByAspect[aspect] : null,
    targetBytes: safeTargetBytes,
  };
}
