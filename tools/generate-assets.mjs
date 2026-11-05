#!/usr/bin/env node
/**
 * Generate the premium look with hosted generative models and write assets/manifest.json.
 * The scene works without any of this (procedural fallbacks); each asset upgrades one layer.
 *
 *   node tools/generate-assets.mjs --sky --stone --model
 *
 * Providers (set the keys you have; steps without a key are skipped):
 *   BLOCKADE_API_KEY  Blockade Labs Skybox AI  → assets/skybox.jpg      (360° equirectangular night sky, the environment light too)
 *   FAL_KEY           fal.ai FLUX 1.1 Pro Ultra → assets/stone_albedo.png (seamless river-stone texture, 2048²)
 *   MESHY_API_KEY     Meshy text-to-3D          → assets/stone.glb       (a real scanned-looking stone mesh, replaces the procedural shape)
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "assets");
mkdirSync(OUT, { recursive: true });
const args = new Set(process.argv.slice(2));
const want = (k) => args.size === 0 || args.has(`--${k}`);
const manifestPath = path.join(OUT, "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
manifest.stone ??= {};

const PROMPTS = {
  sky: "night sky over a quiet mountain pass in Korea, deep blue to violet gradient, thin high clouds lit by a low full moon on the left horizon, dense stars, faint milky way, distant dark ridgelines, no people, no text, photographic, equirectangular 360 panorama",
  stone: "seamless tileable texture of smooth grey river stone, subtle warm brown veins, fine granite grain, slightly wet sheen, photographed flat with soft even light, no shadows, no text, 8k material scan, albedo",
  model: "a single smooth flat river stone, rounded oval, slightly irregular, grey with warm veins, photoreal, clean topology",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${url}: ${r.status}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  console.log("  saved", path.relative(process.cwd(), file));
}

// ---------- Blockade Labs: 360 skybox ----------
async function skybox() {
  const key = process.env.BLOCKADE_API_KEY;
  if (!key) return console.log("sky: BLOCKADE_API_KEY not set, skipping");
  console.log("sky: requesting skybox…");
  const r = await fetch("https://backend.blockadelabs.com/api/v1/skybox", {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: PROMPTS.sky, negative_text: "people, text, watermark, daylight, sun" }),
  });
  if (!r.ok) throw new Error(`blockade: ${r.status} ${await r.text()}`);
  const { id } = await r.json();
  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    const s = await fetch(`https://backend.blockadelabs.com/api/v1/imagine/requests/${id}`, { headers: { "x-api-key": key } }).then((x) => x.json());
    const req = s.request ?? s;
    if (req.status === "complete") {
      await download(req.file_url, path.join(OUT, "skybox.jpg"));
      manifest.skybox = "/assets/skybox.jpg";
      return;
    }
    if (req.status === "error" || req.status === "abort") throw new Error("blockade failed: " + JSON.stringify(req));
    process.stdout.write(".");
  }
  throw new Error("blockade: timeout");
}

// ---------- fal.ai FLUX 1.1 Pro Ultra: seamless stone albedo ----------
async function stoneTexture() {
  const key = process.env.FAL_KEY;
  if (!key) return console.log("stone: FAL_KEY not set, skipping");
  console.log("stone: generating albedo…");
  const r = await fetch("https://fal.run/fal-ai/flux-pro/v1.1-ultra", {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: PROMPTS.stone, aspect_ratio: "1:1", output_format: "png", raw: true, safety_tolerance: "2" }),
  });
  if (!r.ok) throw new Error(`fal: ${r.status} ${await r.text()}`);
  const j = await r.json();
  await download(j.images[0].url, path.join(OUT, "stone_albedo.png"));
  manifest.stone.albedo = "/assets/stone_albedo.png";
  // Normal + roughness are derived in-engine from the albedo (bump + inverted luminance); drop real maps here if you have them.
}

// ---------- Meshy text-to-3D: a scanned-looking stone ----------
async function stoneModel() {
  const key = process.env.MESHY_API_KEY;
  if (!key) return console.log("model: MESHY_API_KEY not set, skipping");
  const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const poll = async (id) => {
    for (let i = 0; i < 240; i++) {
      await sleep(5000);
      const t = await fetch(`https://api.meshy.ai/openapi/v2/text-to-3d/${id}`, { headers: H }).then((x) => x.json());
      if (t.status === "SUCCEEDED") return t;
      if (t.status === "FAILED") throw new Error("meshy failed: " + JSON.stringify(t));
      process.stdout.write(".");
    }
    throw new Error("meshy: timeout");
  };
  console.log("model: preview…");
  const p = await fetch("https://api.meshy.ai/openapi/v2/text-to-3d", { method: "POST", headers: H, body: JSON.stringify({ mode: "preview", prompt: PROMPTS.model, art_style: "realistic", topology: "quad", target_polycount: 6000 }) }).then((x) => x.json());
  await poll(p.result);
  console.log("\nmodel: refine (textures)…");
  const rf = await fetch("https://api.meshy.ai/openapi/v2/text-to-3d", { method: "POST", headers: H, body: JSON.stringify({ mode: "refine", preview_task_id: p.result, enable_pbr: true }) }).then((x) => x.json());
  const done = await poll(rf.result);
  await download(done.model_urls.glb, path.join(OUT, "stone.glb"));
  manifest.stone.model = "/assets/stone.glb";
}

try {
  if (want("sky")) await skybox();
  if (want("stone")) await stoneTexture();
  if (want("model")) await stoneModel();
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log("\nmanifest:", JSON.stringify(manifest));
} catch (e) {
  console.error("\nfailed:", e.message);
  process.exit(1);
}
