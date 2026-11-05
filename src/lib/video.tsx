/**
 * Server-side "drop moment" video: Satori layout → native resvg (parallel,
 * libuv threadpool) → raw RGBA piped into ffmpeg → MP4 (1080×1920).
 * Rendered once per wish, cached on disk, served by /w/:id/video.
 *
 * Background plates (gradients) are rasterized once and composited by ffmpeg;
 * per-frame work is flat vector + text only, so a 96-frame video takes a few
 * seconds on 4 cores. Needs a long-running Node process; on serverless hosts
 * run this on a worker and point VIDEO_CACHE_DIR at shared storage.
 */
import React from "react";
import satori, { type Font } from "satori";
import { renderAsync } from "@resvg/resvg-js";
import { spawn } from "node:child_process";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ChannelDef, Locale } from "./channels";
import { Token, CARD_COPY } from "./card";
import { RARITY_STYLE, type Rarity } from "./relics";
import { loadFont, fontFamilyFor, detectFontLocale } from "./fonts";
import { VIDEO, FRAME_COUNT, frameAt, timeOfFrame } from "./video-timeline";

export const VIDEO_VERSION = "v1";
const CACHE_DIR = process.env.VIDEO_CACHE_DIR ?? path.join(process.cwd(), ".cache", "videos");

function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static") as string | null;
    if (p && existsSync(p)) return p;
  } catch {}
  return "ffmpeg";
}

export interface VideoInput {
  wishId: string;
  channel: ChannelDef;
  locale: Locale;
  text: string;
  author: string | null;
  rarity: Rarity;
  relicName: string;
  count: number;
  url: string;
}

const COPY: Record<Locale, { offered: string; dropped: string }> = {
  ko: { offered: "소원을 올렸습니다", dropped: "희귀한 것이 떨어졌습니다" },
  en: { offered: "A wish was offered", dropped: "Something rare dropped" },
  ja: { offered: "願いを捧げました", dropped: "珍しいものが落ちました" },
  zh: { offered: "献上了一个愿望", dropped: "掉落了稀有之物" },
};

export function videoPath(wishId: string) {
  return path.join(CACHE_DIR, `${wishId}.${VIDEO_VERSION}.mp4`);
}

export async function videoExists(wishId: string): Promise<boolean> {
  try {
    return (await stat(videoPath(wishId))).size > 0;
  } catch {
    return false;
  }
}

/**
 * Background plates, rendered once per video. Gradients and blur are the
 * expensive part of rasterization, so they never appear in per-frame work.
 */
export function Plate({ input, rare }: { input: VideoInput; rare: boolean }) {
  const { width: W, height: H } = VIDEO;
  const rs = RARITY_STYLE[input.rarity];
  const hue = input.channel.hue;
  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        background: rare
          ? `radial-gradient(circle at 50% 38%, ${rs.glow}, hsl(${hue} 45% 14%) 45%, #0b0a12 75%)`
          : `radial-gradient(circle at 50% 38%, hsl(${hue} 45% 22%), #0b0a12 60%)`,
      }}
    />
  );
}

/** One foreground frame (transparent background, no blur) as Satori-safe JSX. */
export function Frame({ input, t, fontFamily }: { input: VideoInput; t: number; fontFamily: string }) {
  const { width: W, height: H } = VIDEO;
  const rises = input.channel.visual === "lantern";
  const rare = input.rarity !== "COMMON";
  const f = frameAt(t, { rare, rises, count: input.count });
  const rs = RARITY_STYLE[input.rarity];
  const hue = input.channel.hue;
  const copy = COPY[input.locale];
  const cc = CARD_COPY[input.locale];
  const tokenSize = W * 0.5;
  const borderW = Math.round(14 * f.border);
  const name = f.name > 0 ? input.author ?? "" : "";
  // Group opacity forces resvg to composite a full-canvas layer per group (~0.7s at 1080p).
  // Every fade below is expressed as color alpha instead, which is free.
  const fg = (a: number) => `rgba(243,239,230,${a.toFixed(3)})`;
  const muted = (a: number) => `rgba(163,157,144,${a.toFixed(3)})`;
  const accent = (a: number) => `rgba(240,179,91,${a.toFixed(3)})`;

  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: `"${fontFamily}", "Noto Sans", sans-serif`,
        color: "#f3efe6",
        background: "transparent",
        border: `${borderW}px solid ${rs.color}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* title */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 150, gap: 14 }}>
        <div style={{ display: "flex", fontSize: 34, color: accent(f.title), fontWeight: 700 }}>{input.channel.name[input.locale]}</div>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: fg(f.title) }}>{rare && f.badge > 0 ? copy.dropped : copy.offered}</div>
      </div>

      {/* glow ring on impact */}
      {f.ring > 0 && f.ring < 1 && (
        <div
          style={{
            position: "absolute",
            top: H * 0.42 - (tokenSize * (0.6 + f.ring * 1.2)) / 2,
            left: W / 2 - (tokenSize * (0.6 + f.ring * 1.2)) / 2,
            width: tokenSize * (0.6 + f.ring * 1.2),
            height: tokenSize * (0.6 + f.ring * 1.2),
            borderRadius: "50%",
            border: `${Math.round(18 * (1 - f.ring))}px solid ${rare ? rs.color : "#f3efe6"}`,
          }}
        />
      )}

      {/* object (enters from off-screen; no fade needed) */}
      {f.objectOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            top: H * 0.42 - tokenSize / 2 + f.objectY,
            left: W / 2 - tokenSize / 2,
            width: tokenSize,
            height: tokenSize,
            display: "flex",
            transform: `scale(${f.objectScale})`,
          }}
        >
          <Token visual={input.channel.visual} name={name} hue={hue} size={tokenSize} glow={false} flat />
        </div>
      )}

      {/* rarity badge */}
      {rare && f.badge > 0 && (
        <div
          style={{
            position: "absolute",
            top: H * 0.42 + tokenSize / 2 + 30,
            left: 0,
            width: W,
            display: "flex",
            justifyContent: "center",
            transform: `scale(${f.badge})`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 30px", borderRadius: 999, background: rs.color, color: "#141018", fontWeight: 700, fontSize: 40 }}>
            <div style={{ width: 20, height: 20, background: "#141018", transform: "rotate(45deg)" }} />
            <div style={{ display: "flex" }}>{rs.label[input.locale]} - {input.relicName}</div>
          </div>
        </div>
      )}

      {/* wish text */}
      <div style={{ position: "absolute", top: H * 0.66, left: W * 0.08, width: W * 0.84, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", fontSize: input.text.length > 60 ? 44 : 56, fontWeight: 700, textAlign: "center", lineHeight: 1.3, justifyContent: "center", color: fg(f.title) }}>
          “{input.text.length > 120 ? input.text.slice(0, 117) + "…" : input.text}”
        </div>
        {input.author && <div style={{ display: "flex", marginTop: 16, fontSize: 30, color: muted(f.title) }}>— {input.author}</div>}
      </div>

      {/* counter + CTA */}
      {f.cta > 0 && (
        <div style={{ position: "absolute", bottom: 120, left: 0, width: W, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", fontSize: 28, color: muted(f.cta) }}>
            {f.counter.toLocaleString()} {input.channel.unit[input.locale]}
          </div>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: fg(f.cta) }}>{cc.cta}</div>
          <div style={{ display: "flex", fontSize: 28, color: muted(f.cta) }}>{input.url.replace(/^https?:\/\//, "")}</div>
        </div>
      )}

      {/* flash */}
      {f.flash > 0 && <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, background: `rgba(255,255,255,${f.flash.toFixed(3)})` }} />}
    </div>
  );
}

// ---------------------------------------------------------------- jobs

export interface VideoJob {
  status: "rendering" | "encoding" | "done" | "error";
  progress: number; // 0..1
  error?: string;
  startedAt: number;
}
const jobs = new Map<string, VideoJob>();
let running = 0;
const MAX_CONCURRENT = Number(process.env.VIDEO_MAX_CONCURRENT ?? 1);
const queue: (() => void)[] = [];

export function getJob(wishId: string): VideoJob | undefined {
  return jobs.get(wishId);
}

/** Start (or join) a render job. Returns immediately. */
export function ensureVideoJob(input: VideoInput): VideoJob {
  const existing = jobs.get(input.wishId);
  if (existing && existing.status !== "error") return existing;
  const job: VideoJob = { status: "rendering", progress: 0, startedAt: Date.now() };
  jobs.set(input.wishId, job);
  const run = () => {
    running++;
    renderVideo(input, job)
      .then(() => {
        job.status = "done";
        job.progress = 1;
      })
      .catch((e: Error) => {
        job.status = "error";
        job.error = e.message;
        console.error("video render failed", input.wishId, e);
      })
      .finally(() => {
        running--;
        queue.shift()?.();
        // keep the record briefly so pollers see "done", then drop it
        setTimeout(() => jobs.delete(input.wishId), 60_000);
      });
  };
  if (running < MAX_CONCURRENT) run();
  else queue.push(run);
  return job;
}

async function renderVideo(input: VideoInput, job: VideoJob) {
  await mkdir(CACHE_DIR, { recursive: true });
  const work = path.join(tmpdir(), `wish-video-${input.wishId}-${Date.now()}`);
  await mkdir(work, { recursive: true });
  try {
    const allText = [input.text, input.author ?? "", input.channel.name[input.locale], input.channel.unit[input.locale], input.url, input.relicName, COPY[input.locale].offered, COPY[input.locale].dropped, CARD_COPY[input.locale].cta, RARITY_STYLE[input.rarity].label[input.locale], " - —…“”0123456789"].join("");
    const fontLocale = detectFontLocale(allText, input.locale);
    const fontFamily = fontFamilyFor(fontLocale);
    const [regular, bold] = await Promise.all([loadFont(fontLocale, 400, allText), loadFont(fontLocale, 700, allText)]);
    const fonts = [
      regular && { name: fontFamily, data: regular, weight: 400, style: "normal" },
      bold && { name: fontFamily, data: bold, weight: 700, style: "normal" },
    ].filter(Boolean) as Font[];
    const { width: W, height: H, fps } = VIDEO;
    const satoriOpts = { width: W, height: H, fonts };
    const rare = input.rarity !== "COMMON";

    // Plates once (gradients are the expensive part; ffmpeg composites them under every frame).
    const plate = async (name: string, isRare: boolean) => {
      const svg = await satori(<Plate input={input} rare={isRare} />, satoriOpts);
      const img = await renderAsync(svg, { fitTo: { mode: "width", value: W } });
      await writeFile(path.join(work, name), img.asPng());
    };
    await plate("bg.png", false);
    if (rare) await plate("glow.png", true);

    // ffmpeg: bg plate (looped) + optional glow plate fading in at the reveal + raw RGBA frames on stdin.
    const out = path.join(work, "out.mp4");
    const fpsS = String(fps);
    const inputs = [
      "-loop", "1", "-framerate", fpsS, "-i", path.join(work, "bg.png"),
      "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-framerate", fpsS, "-i", "pipe:0",
    ];
    let filter = "[0:v][1:v]overlay=format=auto:shortest=1,format=yuv420p[v]";
    if (rare) {
      inputs.push("-loop", "1", "-framerate", fpsS, "-i", path.join(work, "glow.png"));
      filter = "[2:v]format=rgba,fade=t=in:st=2.6:d=0.6:alpha=1[g];[0:v][g]overlay=format=auto:shortest=1[b];[b][1:v]overlay=format=auto:shortest=1,format=yuv420p[v]";
    }
    const args = [
      "-y", ...inputs, "-filter_complex", filter, "-map", "[v]",
      "-c:v", "libx264", "-crf", "22", "-preset", "veryfast", "-movflags", "+faststart",
      "-r", fpsS, "-t", String(VIDEO.seconds), out,
    ];
    const ff = spawn(ffmpegPath(), args, { stdio: ["pipe", "ignore", "pipe"] });
    let ffErr = "";
    ff.stderr.on("data", (d) => (ffErr = (ffErr + d.toString()).slice(-2000)));
    const ffDone = new Promise<void>((resolve, reject) => {
      ff.on("error", reject);
      ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${ffErr.slice(-500)}`))));
    });
    ff.stdin.on("error", () => {}); // surfaced via ffDone

    const writeFrame = (buf: Uint8Array) =>
      new Promise<void>((resolve, reject) => {
        if (ff.stdin.destroyed) return reject(new Error("ffmpeg stdin closed"));
        ff.stdin.write(buf, (e) => (e ? reject(e) : resolve()));
      });

    // Layout is ~15ms/frame; rasterization ~100ms/frame on the libuv threadpool. Keep a
    // batch in flight so all cores stay busy, and write frames to ffmpeg in order.
    const BATCH = Math.max(1, Number(process.env.VIDEO_RASTER_PARALLEL ?? 4));
    for (let start = 0; start < FRAME_COUNT; start += BATCH) {
      const idx = Array.from({ length: Math.min(BATCH, FRAME_COUNT - start) }, (_, k) => start + k);
      const svgs = await Promise.all(idx.map((i) => satori(<Frame input={input} t={timeOfFrame(i)} fontFamily={fontFamily} />, satoriOpts)));
      const imgs = await Promise.all(svgs.map((svg) => renderAsync(svg, { fitTo: { mode: "width", value: W } })));
      for (const img of imgs) await writeFrame(img.pixels);
      job.progress = (start + idx.length) / FRAME_COUNT;
    }
    job.status = "encoding";
    ff.stdin.end();
    await ffDone;
    await rename(out, videoPath(input.wishId));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
