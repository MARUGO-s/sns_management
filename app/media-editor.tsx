"use client";

import {
  Pause,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";

export type MediaAspect = "1:1" | "4:5" | "9:16" | "16:9";

export type MediaCutRange = {
  start: number;
  end: number;
};

export type MediaCropConfig = {
  aspect: MediaAspect;
  positionX: number;
  positionY: number;
  zoom: number;
  startTime?: number;
  endTime?: number;
  cuts?: MediaCutRange[];
};

export const defaultMediaCrop: MediaCropConfig = {
  aspect: "9:16",
  positionX: 50,
  positionY: 50,
  zoom: 100,
  startTime: 0,
  cuts: [],
};

const minimumOutputSeconds = 0.5;
const minimumCutSeconds = 0.1;
const maximumCuts = 32;

const aspectOptions: Array<{
  id: MediaAspect;
  label: string;
  description: string;
  width: number;
  height: number;
}> = [
  { id: "1:1", label: "1:1", description: "正方形", width: 1080, height: 1080 },
  { id: "4:5", label: "4:5", description: "縦投稿", width: 1080, height: 1350 },
  { id: "9:16", label: "9:16", description: "リール", width: 1080, height: 1920 },
  { id: "16:9", label: "16:9", description: "横動画", width: 1920, height: 1080 },
];

type MediaEditorProps = {
  fileName: string;
  previewUrl: string;
  value: MediaCropConfig;
  onClose: () => void;
  onSave: (value: MediaCropConfig) => void;
};

type TimelinePlan = {
  cuts: MediaCutRange[];
  segments: MediaCutRange[];
  outputDuration: number;
  removedDuration: number;
  valid: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundTime(value: number) {
  return Math.round(value * 10) / 10;
}

function parseTimeInput(value: string) {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function formatTime(value: number) {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const totalTenths = Math.round(safe * 10);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function normalizeTimeline(
  duration: number,
  startTime: number,
  endTime: number,
  rawCuts: MediaCutRange[],
): TimelinePlan {
  if (!Number.isFinite(duration) || duration <= 0) {
    return {
      cuts: [],
      segments: [],
      outputDuration: 0,
      removedDuration: 0,
      valid: false,
    };
  }

  const start = roundTime(clamp(startTime, 0, duration));
  const end = roundTime(clamp(endTime, 0, duration));
  if (end - start < minimumOutputSeconds) {
    return {
      cuts: [],
      segments: [],
      outputDuration: 0,
      removedDuration: 0,
      valid: false,
    };
  }

  const clipped = rawCuts
    .map((cut) => ({
      start: roundTime(clamp(Number(cut.start), start, end)),
      end: roundTime(clamp(Number(cut.end), start, end)),
    }))
    .filter((cut) => cut.end - cut.start >= minimumCutSeconds)
    .sort((left, right) =>
      left.start === right.start
        ? left.end - right.end
        : left.start - right.start,
    );

  const cuts: MediaCutRange[] = [];
  for (const cut of clipped) {
    const previous = cuts.at(-1);
    if (previous && cut.start <= previous.end + 0.001) {
      previous.end = roundTime(Math.max(previous.end, cut.end));
    } else {
      cuts.push({ ...cut });
    }
  }

  const segments: MediaCutRange[] = [];
  let cursor = start;
  for (const cut of cuts) {
    if (cut.start - cursor > 0.001) {
      segments.push({ start: cursor, end: cut.start });
    }
    cursor = Math.max(cursor, cut.end);
  }
  if (end - cursor > 0.001) segments.push({ start: cursor, end });

  const outputDuration = roundTime(
    segments.reduce(
      (total, segment) => total + segment.end - segment.start,
      0,
    ),
  );
  return {
    cuts,
    segments,
    outputDuration,
    removedDuration: roundTime(duration - outputDuration),
    valid: outputDuration >= minimumOutputSeconds,
  };
}

function nextPlayableTime(plan: TimelinePlan, time: number) {
  const current = Number.isFinite(time) ? time : 0;
  for (const cut of plan.cuts) {
    if (current >= cut.start - 0.02 && current < cut.end - 0.02) {
      return cut.end;
    }
  }
  return null;
}

export default function MediaEditor({
  fileName,
  previewUrl,
  value,
  onClose,
  onSave,
}: MediaEditorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [draft, setDraft] = useState<MediaCropConfig>({
    ...defaultMediaCrop,
    ...value,
    cuts: value.cuts ?? [],
  });
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [newCutStart, setNewCutStart] = useState(0);
  const [newCutEnd, setNewCutEnd] = useState(0);
  const [timelineMessage, setTimelineMessage] = useState("");

  const target = useMemo(
    () => aspectOptions.find((option) => option.id === draft.aspect)!,
    [draft.aspect],
  );
  const startTime = roundTime(clamp(draft.startTime ?? 0, 0, duration || 0));
  const endTime = roundTime(
    clamp(draft.endTime ?? duration, 0, duration || 0),
  );
  const timeline = useMemo(
    () =>
      normalizeTimeline(
        duration,
        startTime,
        endTime,
        draft.cuts ?? [],
      ),
    [duration, startTime, endTime, draft.cuts],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    const nextDuration = roundTime(video.duration);
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) return;
    let nextStart = roundTime(clamp(draft.startTime ?? 0, 0, nextDuration));
    let nextEnd = roundTime(
      clamp(draft.endTime ?? nextDuration, 0, nextDuration),
    );
    if (nextEnd - nextStart < minimumOutputSeconds) {
      nextStart = 0;
      nextEnd = nextDuration;
    }
    setDuration(nextDuration);
    setDraft((current) => {
      const normalized = normalizeTimeline(
        nextDuration,
        nextStart,
        nextEnd,
        current.cuts ?? [],
      );
      return {
        ...current,
        startTime: nextStart,
        endTime: nextEnd,
        cuts: normalized.cuts,
      };
    });
    setNewCutStart(nextStart);
    setNewCutEnd(Math.min(nextDuration, nextStart + 1));
    setTimelineMessage("");
    video.currentTime = nextStart;
    setCurrentTime(nextStart);
  }

  function handleTimeUpdate(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    if (!duration) return;
    if (video.currentTime < startTime - 0.05) {
      video.currentTime = startTime;
      return;
    }
    const skippedTo = nextPlayableTime(timeline, video.currentTime);
    if (skippedTo != null) {
      video.currentTime = Math.min(skippedTo, endTime);
      return;
    }
    if (video.currentTime >= endTime - 0.02) {
      video.pause();
      video.currentTime = startTime;
      setCurrentTime(startTime);
      return;
    }
    setCurrentTime(roundTime(video.currentTime));
  }

  function seek(time: number) {
    if (!Number.isFinite(time)) return;
    const video = videoRef.current;
    const requested = roundTime(clamp(time, startTime, endTime));
    const skippedTo = nextPlayableTime(timeline, requested);
    const safe = roundTime(
      clamp(skippedTo == null ? requested : skippedTo, startTime, endTime),
    );
    if (video) video.currentTime = safe;
    setCurrentTime(safe);
  }

  function updateStart(time: number) {
    if (!Number.isFinite(time)) {
      setTimelineMessage("開始時間を数値で入力してください。");
      return;
    }
    const safe = roundTime(
      clamp(time, 0, Math.max(0, endTime - minimumOutputSeconds)),
    );
    setDraft((current) => ({
      ...current,
      startTime: safe,
      cuts: normalizeTimeline(
        duration,
        safe,
        endTime,
        current.cuts ?? [],
      ).cuts,
    }));
    setTimelineMessage("");
    setNewCutStart((current) => roundTime(clamp(current, safe, endTime)));
    setNewCutEnd((current) =>
      roundTime(
        clamp(
          Math.max(current, safe + minimumCutSeconds),
          safe,
          endTime,
        ),
      ),
    );
    if (currentTime < safe) seek(safe);
  }

  function updateEnd(time: number) {
    if (!Number.isFinite(time)) {
      setTimelineMessage("終了時間を数値で入力してください。");
      return;
    }
    const safe = roundTime(
      clamp(time, startTime + minimumOutputSeconds, duration),
    );
    setDraft((current) => ({
      ...current,
      endTime: safe,
      cuts: normalizeTimeline(
        duration,
        startTime,
        safe,
        current.cuts ?? [],
      ).cuts,
    }));
    setTimelineMessage("");
    setNewCutStart((current) => roundTime(clamp(current, startTime, safe)));
    setNewCutEnd((current) =>
      roundTime(
        clamp(
          Math.max(current, startTime + minimumCutSeconds),
          startTime,
          safe,
        ),
      ),
    );
    if (currentTime > safe) seek(safe);
  }

  function addCut() {
    if (!duration) {
      setTimelineMessage("動画の読み込み完了後にカットを追加できます。");
      return;
    }
    if (timeline.cuts.length >= maximumCuts) {
      setTimelineMessage(`途中カットは最大${maximumCuts}件までです。`);
      return;
    }
    if (newCutEnd <= newCutStart) {
      setTimelineMessage("途中カットの終了は開始より後にしてください。");
      return;
    }
    if (newCutEnd - newCutStart < minimumCutSeconds) {
      setTimelineMessage("カット範囲は0.1秒以上にしてください。");
      return;
    }
    const nextCuts = [
      ...timeline.cuts,
      {
        start: roundTime(clamp(newCutStart, startTime, endTime)),
        end: roundTime(clamp(newCutEnd, startTime, endTime)),
      },
    ];
    const normalized = normalizeTimeline(
      duration,
      startTime,
      endTime,
      nextCuts,
    );
    if (!normalized.valid) {
      setTimelineMessage("動画全体を削除するカットは追加できません。");
      return;
    }
    setDraft((current) => ({ ...current, cuts: normalized.cuts }));
    setTimelineMessage("");
  }

  function updateNewCutStart(time: number) {
    if (!Number.isFinite(time)) {
      setTimelineMessage("途中カットの開始時間を数値で入力してください。");
      return;
    }
    setNewCutStart(roundTime(clamp(time, startTime, endTime)));
    setTimelineMessage("");
  }

  function updateNewCutEnd(time: number) {
    if (!Number.isFinite(time)) {
      setTimelineMessage("途中カットの終了時間を数値で入力してください。");
      return;
    }
    setNewCutEnd(roundTime(clamp(time, startTime, endTime)));
    setTimelineMessage("");
  }

  function removeCut(index: number) {
    setDraft((current) => ({
      ...current,
      cuts: timeline.cuts.filter((_, itemIndex) => itemIndex !== index),
    }));
    setTimelineMessage("");
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime < startTime || video.currentTime >= endTime) {
        video.currentTime = startTime;
      }
      void video.play();
    } else {
      video.pause();
    }
  }

  function resetDraft() {
    const next = {
      ...defaultMediaCrop,
      endTime: duration || undefined,
      cuts: [],
    };
    setDraft(next);
    if (videoRef.current) videoRef.current.currentTime = 0;
    setCurrentTime(0);
    setNewCutStart(0);
    setNewCutEnd(Math.min(duration, 1));
    setTimelineMessage("");
  }

  function save() {
    if (!duration || !timeline.valid) {
      setTimelineMessage("編集後の動画を0.5秒以上残してください。");
      return;
    }
    onSave({
      aspect: draft.aspect,
      positionX: draft.positionX,
      positionY: draft.positionY,
      zoom: draft.zoom,
      startTime,
      endTime,
      cuts: timeline.cuts,
    });
  }

  return (
    <div
      className="media-editor-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="media-editor-title"
        aria-modal="true"
        className="media-editor-dialog"
        role="dialog"
      >
        <header className="media-editor-header">
          <div>
            <p className="eyebrow">Video Editor</p>
            <h3 id="media-editor-title">動画を編集</h3>
            <span>{fileName}</span>
          </div>
          <button
            aria-label="動画編集を閉じる"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="media-editor-body">
          <div className="media-editor-stage">
            <div
              className="media-crop-frame"
              style={{ aspectRatio: `${target.width} / ${target.height}` }}
            >
              <video
                controls
                onLoadedMetadata={handleMetadata}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onTimeUpdate={handleTimeUpdate}
                playsInline
                ref={videoRef}
                src={previewUrl}
                style={{
                  objectPosition: `${draft.positionX}% ${draft.positionY}%`,
                  transform: `scale(${draft.zoom / 100})`,
                }}
              />
            </div>
            <div className="media-preview-controls">
              <button
                className="icon-button"
                disabled={!duration}
                onClick={togglePlayback}
                type="button"
              >
                {isPlaying ? (
                  <Pause aria-hidden="true" size={16} />
                ) : (
                  <Play aria-hidden="true" size={16} />
                )}
                <span className="sr-only">
                  {isPlaying ? "一時停止" : "再生"}
                </span>
              </button>
              <input
                aria-label="動画の再生位置"
                disabled={!duration}
                max={duration || 0}
                min="0"
                onChange={(event) => seek(Number(event.target.value))}
                step="0.1"
                type="range"
                value={currentTime}
              />
              <strong>
                {formatTime(currentTime)} / {formatTime(duration)}
              </strong>
            </div>
            <p>
              出力 {target.width} x {target.height}px / MP4
            </p>
          </div>

          <div className="media-editor-controls">
            <fieldset>
              <legend>縦横比</legend>
              <div className="aspect-segmented">
                {aspectOptions.map((option) => (
                  <button
                    aria-pressed={draft.aspect === option.id}
                    className={draft.aspect === option.id ? "active" : ""}
                    key={option.id}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        aspect: option.id,
                      }))
                    }
                    type="button"
                  >
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="media-range">
              <span>
                横位置
                <strong>{draft.positionX}%</strong>
              </span>
              <input
                max="100"
                min="0"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    positionX: Number(event.target.value),
                  }))
                }
                type="range"
                value={draft.positionX}
              />
            </label>

            <label className="media-range">
              <span>
                縦位置
                <strong>{draft.positionY}%</strong>
              </span>
              <input
                max="100"
                min="0"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    positionY: Number(event.target.value),
                  }))
                }
                type="range"
                value={draft.positionY}
              />
            </label>

            <label className="media-range">
              <span>
                拡大
                <strong>{draft.zoom}%</strong>
              </span>
              <input
                max="200"
                min="100"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    zoom: Number(event.target.value),
                  }))
                }
                type="range"
                value={draft.zoom}
              />
            </label>

            <fieldset className="timeline-editor">
              <legend>時間を編集</legend>
              <div className="timeline-summary">
                <span>
                  元動画 <strong>{formatTime(duration)}</strong>
                </span>
                <span>
                  編集後 <strong>{formatTime(timeline.outputDuration)}</strong>
                </span>
                <span>
                  削除 <strong>{formatTime(timeline.removedDuration)}</strong>
                </span>
              </div>

              <div className="timeline-window">
                <label>
                  <span>開始</span>
                  <input
                    disabled={!duration}
                    max={Math.max(0, endTime - minimumOutputSeconds)}
                    min="0"
                    onChange={(event) =>
                      updateStart(parseTimeInput(event.target.value))
                    }
                    step="0.1"
                    type="number"
                    value={startTime}
                  />
                  <input
                    aria-label="開始位置を調整"
                    disabled={!duration}
                    max={Math.max(0, endTime - minimumOutputSeconds)}
                    min="0"
                    onChange={(event) => updateStart(Number(event.target.value))}
                    step="0.1"
                    type="range"
                    value={startTime}
                  />
                </label>
                <button
                  className="ghost-button compact"
                  disabled={!duration}
                  onClick={() => updateStart(currentTime)}
                  type="button"
                >
                  現在位置
                </button>
                <label>
                  <span>終了</span>
                  <input
                    disabled={!duration}
                    max={duration || 0}
                    min={startTime + minimumOutputSeconds}
                    onChange={(event) =>
                      updateEnd(parseTimeInput(event.target.value))
                    }
                    step="0.1"
                    type="number"
                    value={endTime}
                  />
                  <input
                    aria-label="終了位置を調整"
                    disabled={!duration}
                    max={duration || 0}
                    min={startTime + minimumOutputSeconds}
                    onChange={(event) => updateEnd(Number(event.target.value))}
                    step="0.1"
                    type="range"
                    value={endTime}
                  />
                </label>
                <button
                  className="ghost-button compact"
                  disabled={!duration}
                  onClick={() => updateEnd(currentTime)}
                  type="button"
                >
                  現在位置
                </button>
              </div>

              <button
                aria-label="動画タイムライン"
                className="timeline-track"
                disabled={!duration}
                onClick={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const ratio = clamp(
                    (event.clientX - bounds.left) / bounds.width,
                    0,
                    1,
                  );
                  seek(duration * ratio);
                }}
                type="button"
              >
                <span
                  className="timeline-selected-range"
                  style={{
                    left: `${duration ? (startTime / duration) * 100 : 0}%`,
                    width: `${
                      duration ? ((endTime - startTime) / duration) * 100 : 0
                    }%`,
                  }}
                />
                {timeline.cuts.map((cut, index) => (
                  <span
                    className="timeline-cut-range"
                    key={`${cut.start}-${cut.end}-${index}`}
                    style={{
                      left: `${duration ? (cut.start / duration) * 100 : 0}%`,
                      width: `${
                        duration ? ((cut.end - cut.start) / duration) * 100 : 0
                      }%`,
                    }}
                  />
                ))}
                <span
                  className="timeline-playhead"
                  style={{
                    left: `${duration ? (currentTime / duration) * 100 : 0}%`,
                  }}
                />
              </button>

              <div className="timeline-cut-form">
                <label>
                  <span>途中カット開始</span>
                  <input
                    disabled={!duration}
                    max={endTime}
                    min={startTime}
                    onChange={(event) =>
                      updateNewCutStart(parseTimeInput(event.target.value))
                    }
                    step="0.1"
                    type="number"
                    value={newCutStart}
                  />
                  <input
                    aria-label="途中カットの開始位置を調整"
                    disabled={!duration}
                    max={endTime}
                    min={startTime}
                    onChange={(event) =>
                      updateNewCutStart(Number(event.target.value))
                    }
                    step="0.1"
                    type="range"
                    value={newCutStart}
                  />
                </label>
                <button
                  className="ghost-button compact"
                  disabled={!duration}
                  onClick={() => updateNewCutStart(currentTime)}
                  type="button"
                >
                  現在位置
                </button>
                <label>
                  <span>途中カット終了</span>
                  <input
                    disabled={!duration}
                    max={endTime}
                    min={startTime}
                    onChange={(event) =>
                      updateNewCutEnd(parseTimeInput(event.target.value))
                    }
                    step="0.1"
                    type="number"
                    value={newCutEnd}
                  />
                  <input
                    aria-label="途中カットの終了位置を調整"
                    disabled={!duration}
                    max={endTime}
                    min={startTime}
                    onChange={(event) =>
                      updateNewCutEnd(Number(event.target.value))
                    }
                    step="0.1"
                    type="range"
                    value={newCutEnd}
                  />
                </label>
                <button
                  className="ghost-button compact"
                  disabled={!duration}
                  onClick={() => updateNewCutEnd(currentTime)}
                  type="button"
                >
                  現在位置
                </button>
                <button
                  className="ghost-button timeline-add-cut"
                  disabled={
                    !duration
                  }
                  onClick={addCut}
                  type="button"
                >
                  <Plus aria-hidden="true" size={15} />
                  途中をカット
                </button>
              </div>

              {timeline.cuts.length > 0 ? (
                <div className="timeline-cut-list">
                  {timeline.cuts.map((cut, index) => (
                    <div key={`${cut.start}-${cut.end}-${index}`}>
                      <Scissors aria-hidden="true" size={14} />
                      <span>
                        {formatTime(cut.start)}〜{formatTime(cut.end)}
                      </span>
                      <button
                        aria-label={`${formatTime(cut.start)}から${formatTime(cut.end)}のカットを削除`}
                        className="icon-button"
                        onClick={() => removeCut(index)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="timeline-empty">
                  途中カットはありません。開始・終了だけでも保存できます。
                </p>
              )}
              <p className="timeline-help">
                緑が使用範囲、灰色の前後と赤い範囲が削除部分です。プレビュー再生では途中カットを自動で飛ばします。
              </p>
              {timelineMessage && (
                <p className="timeline-message" role="alert">
                  {timelineMessage}
                </p>
              )}
            </fieldset>
          </div>
        </div>

        <footer className="media-editor-actions">
          <button
            className="ghost-button"
            onClick={resetDraft}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={16} />
            初期値に戻す
          </button>
          <button
            className="primary-button"
            disabled={!duration}
            onClick={save}
            type="button"
          >
            <Scissors aria-hidden="true" size={16} />
            動画編集を保存
          </button>
        </footer>
      </section>
    </div>
  );
}
