#!/usr/bin/env node
// Render a vertical (9:16) clip of stones dropping onto the live tower, for X / TikTok / Shorts.
//
//   node tools/make-video.mjs --url http://localhost:3000 --names "Sora,Minjun,Aroha,Diego,Yuki,Amara" \
//        --seconds 18 --fps 24 --caption "wishcairn.app" --sub "a tower to the firmament" --out out/tower.mp4
//
// How: opens the tower page in headless Chromium with ?video=1 (the page stops animating on its own and exposes
// window.__video), steps the simulation one frame at a time, screenshots every frame and pipes them into ffmpeg.
// Nothing is written to the server: the dropped stones exist only in the capture. Needs ffmpeg on PATH.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
// playwright is resolved with require() so a global install (NODE_PATH) works too; `npm i -D playwright` otherwise
let chromium; try { ({ chromium } = createRequire(import.meta.url)("playwright")); } catch { console.error("playwright not found: npm i -D playwright && npx playwright install chromium"); process.exit(1); }

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const URL_ = arg("url", "http://localhost:3000"), NAMES = arg("names", "Sora,Minjun,Aroha,Diego,Yuki,Amara,Leila,Noah").split(",").map((s) => s.trim()).filter(Boolean);
const SECONDS = Number(arg("seconds", 18)), FPS = Number(arg("fps", 24)), OUT = arg("out", "out/tower.mp4"), LANG = arg("lang", "en");
const CAPTION = arg("caption", ""), SUB = arg("sub", ""), W = Number(arg("width", 540)), H = Number(arg("height", 960)), DPR = Number(arg("dpr", 2));
const EXEC = process.env.CHROMIUM_PATH; // e.g. /opt/pw-browsers/chromium when the project pins its own Playwright

mkdirSync(path.dirname(OUT), { recursive: true });
const ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-vcodec", "mjpeg", "-i", "-", "-vf", `scale=${W * DPR}:${H * DPR}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", OUT], { stdio: ["pipe", "inherit", "inherit"] });
const browser = await chromium.launch({ ...(EXEC ? { executablePath: EXEC } : {}), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(`${URL_}/?video=1&lang=${LANG}`, { waitUntil: "load" });
await page.waitForFunction(() => window.__video?.ready, null, { timeout: 60_000 });

// schedule: a short establishing shot, then one stone every so often, then the caption for the last 3 s
const frames = Math.round(SECONDS * FPS), dt = 1 / FPS;
const firstDrop = 1.2, lastDrop = Math.max(firstDrop + 1, SECONDS - 4), gap = NAMES.length > 1 ? (lastDrop - firstDrop) / (NAMES.length - 1) : 0;
const drops = NAMES.map((name, i) => ({ at: firstDrop + i * gap, name }));
const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  const t = f * dt;
  while (drops.length && drops[0].at <= t) await page.evaluate((n) => window.__video.drop(n), drops.shift().name);
  if (CAPTION && Math.abs(t - (SECONDS - 3)) < dt / 2) await page.evaluate(([c, s]) => window.__video.caption(c, s), [CAPTION, SUB]);
  await page.evaluate((d) => window.__video.step(d), dt);
  const jpg = await page.screenshot({ type: "jpeg", quality: 92 });
  if (!ffmpeg.stdin.write(jpg)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
  if (f % FPS === 0) console.log(`${t.toFixed(0)}s / ${SECONDS}s · ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed`);
}
const stats = await page.evaluate(() => window.__video.stats());
ffmpeg.stdin.end();
await new Promise((r) => ffmpeg.on("close", r));
await browser.close();
console.log(`wrote ${OUT} · ${frames} frames @ ${FPS} fps · tower ${stats.meters.toFixed(2)} m (${stats.total} stones) · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
