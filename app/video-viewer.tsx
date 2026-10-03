"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

type VideoViewerProps = {
  fileName: string;
  url: string;
  variantLabel: string;
  onClose: () => void;
  onDownload: () => void;
};

export default function VideoViewer({
  fileName,
  url,
  variantLabel,
  onClose,
  onDownload,
}: VideoViewerProps) {
  const [playbackError, setPlaybackError] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="media-editor-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="video-viewer-title"
        aria-modal="true"
        className="video-viewer-dialog"
        role="dialog"
      >
        <header className="video-viewer-header">
          <div>
            <p className="eyebrow">Video Preview</p>
            <h3 id="video-viewer-title">アプリ内で動画を再生</h3>
            <span>
              {fileName} / {variantLabel}
            </span>
          </div>
          <button
            aria-label="動画プレーヤーを閉じる"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="video-viewer-stage">
          <video
            autoPlay
            controls
            key={url}
            onError={() => setPlaybackError(true)}
            onLoadedData={() => setPlaybackError(false)}
            playsInline
            preload="metadata"
            src={url}
          >
            お使いのブラウザは動画再生に対応していません。
          </video>
          {playbackError && (
            <div className="video-viewer-error" role="alert">
              動画を読み込めませんでした。一度閉じて、もう一度再生してください。
            </div>
          )}
        </div>

        <footer className="video-viewer-actions">
          <p>再生URLは一時的に発行され、Storageは非公開のままです。</p>
          <div>
            <button className="ghost-button" onClick={onClose} type="button">
              閉じる
            </button>
            <button
              className="primary-button"
              onClick={onDownload}
              type="button"
            >
              <Download aria-hidden="true" size={16} />
              ダウンロード
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
