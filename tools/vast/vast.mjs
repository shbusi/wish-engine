#!/usr/bin/env node
/**
 * Rent a vast.ai GPU, run the asset generation there, fetch the results.
 *   node tools/vast/vast.mjs offers            # cheapest suitable GPUs
 *   node tools/vast/vast.mjs rent [offerId]    # start generation (auto-destroys when done)
 *   node tools/vast/vast.mjs status            # instance + job status
 *   node tools/vast/vast.mjs fetch <runId>     # download results into assets/ and update manifest
 *   node tools/vast/vast.mjs destroy <id>
 * Env: VAST_API_KEY, HF_TOKEN, RELAY_S3_{ENDPOINT,BUCKET,REGION,ACCESS_KEY_ID,SECRET_ACCESS_KEY,STYLE}
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const API = "https://console.vast.ai/api/v0";
const KEY = process.env.VAST_API_KEY;
const S3 = () => new S3Client({
  endpoint: process.env.RELAY_S3_ENDPOINT, region: process.env.RELAY_S3_REGION ?? "auto",
  forcePathStyle: (process.env.RELAY_S3_STYLE ?? "path") === "path",
  credentials: { accessKeyId: process.env.RELAY_S3_ACCESS_KEY_ID, secretAccessKey: process.env.RELAY_S3_SECRET_ACCESS_KEY },
});
const BUCKET = process.env.RELAY_S3_BUCKET;
const PREFIX = "wish-cairn/assets";

async function vast(method, p, body) {
  if (!KEY) throw new Error("VAST_API_KEY not set");
  const r = await fetch(`${API}${p}`, { method, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`vast ${method} ${p}: ${r.status} ${t.slice(0, 300)}`);
  try { return JSON.parse(t); } catch { return t; }
}

export async function offers({ minVram = 40, maxPrice = 0.9, minDisk = 80 } = {}) {
  const q = {
    verified: { eq: true }, rentable: { eq: true }, rented: { eq: false }, num_gpus: { eq: 1 },
    gpu_ram: { gte: minVram * 1024 }, disk_space: { gte: minDisk }, dph_total: { lte: maxPrice },
    inet_down: { gte: 200 }, reliability2: { gte: 0.95 }, cuda_max_good: { gte: 12.6 },
    order: [["dph_total", "asc"]], type: "on-demand", limit: 15,
  };
  const r = await vast("GET", `/bundles/?q=${encodeURIComponent(JSON.stringify(q))}`);
  return (r.offers ?? []).map((o) => ({ id: o.id, gpu: o.gpu_name, vram: Math.round(o.gpu_ram / 1024), price: +o.dph_total.toFixed(3), disk: Math.round(o.disk_space), down: Math.round(o.inet_down), rel: +(o.reliability2 ?? 0).toFixed(3), geo: o.geolocation, cuda: o.cuda_max_good }));
}

export async function rent(offerId, runId) {
  const onstart = readFileSync(path.join(HERE, "onstart.sh"), "utf8").replace("__GENERATE_PY__", readFileSync(path.join(HERE, "generate.py"), "utf8"));
  const env = {
    RUN_ID: runId, HF_TOKEN: process.env.HF_TOKEN ?? "", VAST_API_KEY: KEY, S3_ENDPOINT: process.env.RELAY_S3_ENDPOINT, S3_BUCKET: BUCKET,
    S3_REGION: process.env.RELAY_S3_REGION ?? "auto", S3_KEY: process.env.RELAY_S3_ACCESS_KEY_ID, S3_SECRET: process.env.RELAY_S3_SECRET_ACCESS_KEY,
    S3_PREFIX: `${PREFIX}/${runId}`, S3_STYLE: process.env.RELAY_S3_STYLE ?? "path",
  };
  return vast("PUT", `/asks/${offerId}/`, {
    client_id: "me", image: "pytorch/pytorch:2.7.1-cuda12.6-cudnn9-runtime", disk: 80, label: `wish-cairn-assets-${runId}`,
    onstart, runtype: "ssh", env, image_login: null,
  });
}

const RUN_FILE = path.join(ROOT, ".cache", "vast-run.json");
const saveRun = (o) => { mkdirSync(path.dirname(RUN_FILE), { recursive: true }); writeFileSync(RUN_FILE, JSON.stringify(o)); };
const loadRun = () => { try { return JSON.parse(readFileSync(RUN_FILE, "utf8")); } catch { return null; } };
const brief = (i) => ({ id: i.id, status: i.actual_status, state: i.cur_state, msg: i.status_msg, gpu: i.gpu_name, price: +(i.dph_total ?? 0).toFixed(3), label: i.label, up: i.start_date ? Math.round((Date.now() / 1000 - i.start_date) / 60) + "m" : "" });
/** The list endpoint is unreliable for fresh contracts; look the current run's instance up directly. */
export async function instances() {
  const r = await vast("GET", "/instances/").catch(() => ({}));
  const list = (r.instances ?? []).map(brief);
  const run = loadRun();
  if (run?.instanceId && !list.some((i) => i.id === run.instanceId)) {
    try { const one = await vast("GET", `/instances/${run.instanceId}/`); const i = one.instances ?? one; if (i?.id) list.push(brief(i)); } catch {}
  }
  return list;
}
export const destroy = (id) => vast("DELETE", `/instances/${id}/`);

async function s3Text(key) {
  try { const r = await S3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key })); return await r.Body.transformToString(); } catch { return null; }
}
export async function jobStatus(runId) {
  const s = await s3Text(`${PREFIX}/${runId}/status.json`);
  return s ? JSON.parse(s) : null;
}
export async function fetchRun(runId) {
  const list = await S3().send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `${PREFIX}/${runId}/` }));
  const out = path.join(ROOT, "assets"); mkdirSync(out, { recursive: true });
  const got = [];
  for (const o of list.Contents ?? []) {
    const name = path.basename(o.Key);
    if (name === "status.json" || name === "log.txt") continue;
    const r = await S3().send(new GetObjectCommand({ Bucket: BUCKET, Key: o.Key }));
    writeFileSync(path.join(out, name), Buffer.from(await r.Body.transformToByteArray()));
    got.push(name);
  }
  const mp = path.join(out, "manifest.json");
  const m = JSON.parse(readFileSync(mp, "utf8")); m.stone ??= {};
  if (got.includes("skybox.jpg")) m.skybox = "/assets/skybox.jpg";
  if (got.includes("stone_albedo.jpg")) m.stone.albedo = "/assets/stone_albedo.jpg";
  if (got.includes("stone_normal.jpg")) m.stone.normal = "/assets/stone_normal.jpg";
  if (got.includes("stone_roughness.jpg")) m.stone.roughness = "/assets/stone_roughness.jpg";
  writeFileSync(mp, JSON.stringify(m, null, 2));
  return got;
}
export async function s3Check() {
  await S3().send(new PutObjectCommand({ Bucket: BUCKET, Key: `${PREFIX}/_ping`, Body: String(Date.now()) }));
  return (await s3Text(`${PREFIX}/_ping`)) !== null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, arg] = process.argv.slice(2);
  const show = (x) => console.log(JSON.stringify(x, null, 1));
  if (cmd === "offers") show(await offers());
  else if (cmd === "offers24") show(await offers({ minVram: 22, maxPrice: 0.6 }));
  else if (cmd === "s3") console.log("s3 relay ok:", await s3Check());
  else if (cmd === "status") { show(await instances()); if (arg) show(await jobStatus(arg)); }
  else if (cmd === "rent") { const runId = `r${Date.now().toString(36)}`; const result = await rent(arg, runId); if (result?.new_contract) saveRun({ runId, instanceId: result.new_contract, offerId: arg, at: Date.now() }); show({ runId, instanceId: result?.new_contract, success: result?.success }); }
  else if (cmd === "destroy") show(await destroy(arg));
  else if (cmd === "fetch") show(await fetchRun(arg));
  else if (cmd === "job") show(await jobStatus(arg));
  else console.log("offers | offers24 | s3 | rent <offerId> | status [runId] | job <runId> | fetch <runId> | destroy <id>");
}
