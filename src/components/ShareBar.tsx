"use client";
import { useState } from "react";

/**
 * Share loop UI. Short-form platforms (TikTok, Reels, Shorts) have no web
 * share intent, so the path there is: download/share the 9:16 card image,
 * then post it with the link. On mobile the native share sheet (Web Share
 * API level 2) can hand the PNG straight to Instagram / TikTok.
 */
export function ShareBar({
  wishId,
  shareUrl,
  text,
  labels,
}: {
  wishId: string;
  shareUrl: string;
  text: string;
  labels: { share: string; copy: string; copied: string; download: string; x: string; story: string; square: string; video: string; videoRendering: string; videoReady: string; videoFailed: string };
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [video, setVideo] = useState<{ state: "idle" | "rendering" | "ready" | "failed"; progress: number }>({ state: "idle", progress: 0 });
  const videoUrl = `/w/${wishId}/video`;

  /** Ask the server for the MP4; poll until it is rendered, then download. */
  async function makeVideo() {
    count();
    setVideo({ state: "rendering", progress: 0 });
    for (let i = 0; i < 120; i++) {
      const res = await fetch(videoUrl, { headers: { Accept: "application/json, video/mp4" } });
      if (res.status === 200) {
        setVideo({ state: "ready", progress: 1 });
        const a = document.createElement("a");
        a.href = videoUrl;
        a.download = `wish-${wishId}.mp4`;
        a.click();
        return;
      }
      if (res.status !== 202) break;
      const j = await res.json().catch(() => ({ progress: 0 }));
      setVideo({ state: "rendering", progress: j.progress ?? 0 });
      await new Promise((r) => setTimeout(r, 1500));
    }
    setVideo({ state: "failed", progress: 0 });
  }
  const cardStory = `/w/${wishId}/card?f=story`;
  const cardSquare = `/w/${wishId}/card?f=square`;

  function count() {
    fetch(`/api/wishes/${wishId}/share`, { method: "POST" }).catch(() => {});
  }

  async function nativeShare() {
    count();
    setBusy(true);
    try {
      const res = await fetch(cardStory);
      const blob = await res.blob();
      const file = new File([blob], "wish.png", { type: "image/png" });
      const data: ShareData = { title: "Wish Engine", text, url: shareUrl };
      if (navigator.canShare?.({ files: [file] })) data.files = [file];
      await navigator.share(data);
    } catch {
      // user cancelled or unsupported; fall through
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    count();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canNative && (
          <button className="btn" onClick={nativeShare} disabled={busy}>
            📤 {labels.share}
          </button>
        )}
        <a
          className="btn btn-ghost"
          target="_blank"
          rel="noreferrer"
          onClick={count}
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`}
        >
          𝕏 {labels.x}
        </a>
        <button className="btn btn-ghost" onClick={copy}>
          🔗 {copied ? labels.copied : labels.copy}
        </button>
        <a className="btn btn-ghost" href={cardStory} download={`wish-${wishId}-story.png`} onClick={count}>
          ⬇️ {labels.story}
        </a>
        <a className="btn btn-ghost" href={cardSquare} download={`wish-${wishId}-square.png`} onClick={count}>
          ⬇️ {labels.square}
        </a>
        <button className="btn btn-ghost" onClick={makeVideo} disabled={video.state === "rendering"}>
          🎬{" "}
          {video.state === "rendering"
            ? `${labels.videoRendering} ${Math.round(video.progress * 100)}%`
            : video.state === "ready"
              ? labels.videoReady
              : video.state === "failed"
                ? labels.videoFailed
                : labels.video}
        </button>
      </div>
      <a href={cardStory} target="_blank" rel="noreferrer" className="block card overflow-hidden max-w-[220px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cardSquare} alt="" className="w-full h-auto" loading="lazy" />
      </a>
    </div>
  );
}
