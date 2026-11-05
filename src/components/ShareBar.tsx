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
  labels: { share: string; copy: string; copied: string; download: string; x: string; story: string; square: string };
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
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
      </div>
      <a href={cardStory} target="_blank" rel="noreferrer" className="block card overflow-hidden max-w-[220px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cardSquare} alt="" className="w-full h-auto" loading="lazy" />
      </a>
    </div>
  );
}
