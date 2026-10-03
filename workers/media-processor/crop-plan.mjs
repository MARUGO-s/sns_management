const outputByAspect = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createCropPlan(
  sourceWidth,
  sourceHeight,
  config,
  outputOverride = null,
) {
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0) {
    throw new Error("Invalid source width");
  }
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    throw new Error("Invalid source height");
  }

  const output = outputOverride ?? outputByAspect[config.aspect];
  if (!output) throw new Error("Unsupported crop aspect");
  if (
    !Number.isFinite(output.width) ||
    output.width <= 0 ||
    !Number.isFinite(output.height) ||
    output.height <= 0
  ) {
    throw new Error("Invalid output dimensions");
  }

  const zoom = clamp(Number(config.zoom) || 100, 100, 200) / 100;
  const positionX = clamp(Number(config.positionX) || 50, 0, 100) / 100;
  const positionY = clamp(Number(config.positionY) || 50, 0, 100) / 100;
  const targetRatio = output.width / output.height;
  const sourceRatio = sourceWidth / sourceHeight;

  let cropWidth;
  let cropHeight;
  if (sourceRatio > targetRatio) {
    cropHeight = sourceHeight / zoom;
    cropWidth = cropHeight * targetRatio;
  } else {
    cropWidth = sourceWidth / zoom;
    cropHeight = cropWidth / targetRatio;
  }

  cropWidth = Math.max(2, Math.floor(cropWidth / 2) * 2);
  cropHeight = Math.max(2, Math.floor(cropHeight / 2) * 2);
  const maxX = Math.max(0, sourceWidth - cropWidth);
  const maxY = Math.max(0, sourceHeight - cropHeight);
  const x = Math.floor((maxX * positionX) / 2) * 2;
  const y = Math.floor((maxY * positionY) / 2) * 2;

  return {
    cropWidth,
    cropHeight,
    x,
    y,
    outputWidth: output.width,
    outputHeight: output.height,
    filter: `crop=${cropWidth}:${cropHeight}:${x}:${y},scale=${output.width}:${output.height}:flags=lanczos`,
  };
}
