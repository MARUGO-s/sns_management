import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCropPlan } from "./crop-plan.mjs";
import { createEncodingPlan } from "./encoding-plan.mjs";
import {
  createTimelineFilter,
  createTimelinePlan,
} from "./timeline-plan.mjs";

const storageFileSizeLimit = 50 * 1024 * 1024;

function runtimeConfig() {
  const required = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "MEDIA_JOB_ID"];
  for (const name of required) {
    if (!process.env[name]) throw new Error(`${name} is required`);
  }
  return {
    supabaseUrl: process.env.SUPABASE_URL.replace(/\/$/, ""),
    secretKey: process.env.SUPABASE_SECRET_KEY,
    jobId: process.env.MEDIA_JOB_ID,
    bucket: process.env.MEDIA_BUCKET || "social-post-files",
  };
}

function apiHeaders(config, extra = {}) {
  return {
    apikey: config.secretKey,
    authorization: `Bearer ${config.secretKey}`,
    ...extra,
  };
}

function encodeObjectPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function rest(config, path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: apiHeaders(config, {
      "content-type": "application/json",
      ...(options.headers || {}),
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase REST ${response.status}: ${message.slice(0, 300)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function updateJob(config, values) {
  await rest(config, `social_media_jobs?id=eq.${encodeURIComponent(config.jobId)}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      ...values,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${code}): ${stderr.slice(-1200)}`));
    });
  });
}

async function probeVideo(inputPath) {
  const output = await new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,width,height:format=duration",
      "-of",
      "json",
      inputPath,
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`ffprobe failed (${code}): ${stderr.slice(-600)}`));
    });
  });
  const parsed = JSON.parse(output);
  const stream = parsed.streams?.find((item) => item.codec_type === "video");
  if (!stream?.width || !stream?.height) {
    throw new Error("Video dimensions could not be detected");
  }
  const duration = Number(parsed.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Video duration could not be detected");
  }
  return {
    width: Number(stream.width),
    height: Number(stream.height),
    duration,
    hasAudio: Boolean(
      parsed.streams?.some((item) => item.codec_type === "audio"),
    ),
  };
}

async function processJob(config) {
  const workspaceDir = join("/tmp", `media-${config.jobId}`);
  const [job] = await rest(
    config,
    `social_media_jobs?id=eq.${encodeURIComponent(config.jobId)}&select=*`,
  );
  if (!job) throw new Error("Media job not found");
  if (job.status === "completed" || job.status === "cancelled") return;

  const [source] = await rest(
    config,
    `social_post_files?id=eq.${encodeURIComponent(job.source_file_id)}&select=*`,
  );
  if (!source) throw new Error("Source file not found");
  if (!source.content_type.startsWith("video/")) {
    throw new Error("Only video inputs are supported");
  }

  await updateJob(config, {
    status: "processing",
    error_code: "",
    error_message: "",
    started_at: new Date().toISOString(),
    attempts: Number(job.attempts || 0) + 1,
  });

  const storagePath =
    `${job.workspace_id}/${job.post_id}/processed/${job.id}.mp4`;
  const [existingOutput] = await rest(
    config,
    `social_post_files?storage_path=eq.${encodeURIComponent(storagePath)}&select=id`,
  );
  if (existingOutput) {
    await updateJob(config, {
      status: "completed",
      output_file_id: existingOutput.id,
      output_storage_path: storagePath,
      completed_at: new Date().toISOString(),
    });
    return;
  }

  try {
    await mkdir(workspaceDir, { recursive: true });
    const inputPath = join(workspaceDir, "input-video");
    const outputPath = join(workspaceDir, "output.mp4");
    const sourceResponse = await fetch(
      `${config.supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(config.bucket)}/${encodeObjectPath(source.storage_path)}`,
      { headers: apiHeaders(config) },
    );
    if (!sourceResponse.ok) {
      const message = await sourceResponse.text();
      throw new Error(
        `Source download failed (${sourceResponse.status}): ${message.slice(0, 300)}`,
      );
    }
    await writeFile(inputPath, Buffer.from(await sourceResponse.arrayBuffer()));

    const dimensions = await probeVideo(inputPath);
    const timeline = createTimelinePlan(dimensions.duration, job.crop_config);
    const encoding = createEncodingPlan(
      timeline.outputDuration,
      job.crop_config.aspect,
      storageFileSizeLimit,
    );
    const plan = createCropPlan(
      dimensions.width,
      dimensions.height,
      job.crop_config,
      encoding.output,
    );
    const timelineFilter = createTimelineFilter(
      timeline,
      plan.filter,
      dimensions.hasAudio,
    );

    const ffmpegArgs = [
      "-hide_banner",
      "-y",
      "-i",
      inputPath,
      "-filter_complex",
      timelineFilter.filter,
      "-map",
      timelineFilter.videoMap,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-b:v",
      `${encoding.videoKbps}k`,
      "-maxrate",
      `${encoding.maxrateKbps}k`,
      "-bufsize",
      `${encoding.bufsizeKbps}k`,
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
    ];
    if (timelineFilter.audioMap) {
      ffmpegArgs.push(
        "-map",
        timelineFilter.audioMap,
        "-c:a",
        "aac",
        "-b:a",
        `${encoding.audioKbps}k`,
      );
    } else {
      ffmpegArgs.push("-an");
    }
    ffmpegArgs.push(outputPath);
    await run("ffmpeg", ffmpegArgs);

    const outputBytes = await readFile(outputPath);
    if (outputBytes.length > storageFileSizeLimit) {
      throw new Error(
        `Processed video exceeds the 50 MB limit (${outputBytes.length} bytes)`,
      );
    }
    const uploadResponse = await fetch(
      `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeObjectPath(storagePath)}`,
      {
        method: "POST",
        headers: apiHeaders(config, {
          "content-type": "video/mp4",
          "x-upsert": "true",
        }),
        body: outputBytes,
      },
    );
    if (!uploadResponse.ok) {
      const message = await uploadResponse.text();
      throw new Error(
        `Output upload failed (${uploadResponse.status}): ${message.slice(0, 300)}`,
      );
    }

    const fileInfo = await stat(outputPath);
    const outputName =
      `${source.file_name.replace(/\.[^.]+$/, "")}-edited-${job.crop_config.aspect.replace(":", "x")}.mp4`;
    const [outputFile] = await rest(
      config,
      "social_post_files?on_conflict=storage_path",
      {
      method: "POST",
      headers: {
        prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        workspace_id: job.workspace_id,
        post_id: job.post_id,
        storage_path: storagePath,
        file_name: outputName,
        content_type: "video/mp4",
        file_size: fileInfo.size,
        created_by: job.requested_by,
        media_variant: "processed",
        generated_from_file_id: source.id,
      }),
      },
    );

    await updateJob(config, {
      status: "completed",
      output_file_id: outputFile.id,
      output_storage_path: storagePath,
      completed_at: new Date().toISOString(),
    });
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
}

let config;
try {
  config = runtimeConfig();
  await processJob(config);
} catch (error) {
  const message = error instanceof Error ? error.message : "Media processing failed";
  if (config) {
    await updateJob(config, {
      status: "failed",
      error_code: "PROCESSING_FAILED",
      error_message: message.slice(0, 500),
      completed_at: new Date().toISOString(),
    }).catch(() => undefined);
  }
  console.error(message);
  throw error;
}
