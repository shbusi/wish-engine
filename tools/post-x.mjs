#!/usr/bin/env node
// Post "today's tower" to X: height, stones today, who stacked the top stone, plus a fresh screenshot.
//
//   X_API_KEY=… X_API_SECRET=… X_ACCESS_TOKEN=… X_ACCESS_SECRET=… node tools/post-x.mjs [--url http://localhost:3000] [--lang en|ko] [--dry-run] [--no-image]
//   node tools/post-x.mjs --selftest        # checks the OAuth 1.0a signer against X's documented example
//
// Needs an X developer app with "Read and Write" user permissions and a user access token/secret generated after that
// setting (developer.x.com → your app → User authentication settings → Read and write, then Keys and tokens).
// The free tier is enough for one post a day. The server can run this on a schedule: X_AUTOPOST=HH:MM (UTC).
import { createHmac, randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? (process.argv[i + 1]?.startsWith("--") ? true : process.argv[i + 1] ?? true) : d; };
const has = (k) => process.argv.includes(`--${k}`);
const API = "https://api.x.com";

// ---------- OAuth 1.0a (HMAC-SHA1) ----------
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
export function oauthHeader({ method, url, params = {}, key, secret, token, tokenSecret, nonce, timestamp }) {
  const o = { oauth_consumer_key: key, oauth_nonce: nonce ?? randomBytes(16).toString("hex"), oauth_signature_method: "HMAC-SHA1", oauth_timestamp: timestamp ?? Math.floor(Date.now() / 1000), oauth_token: token, oauth_version: "1.0" };
  const all = { ...params, ...o };
  const base = [method.toUpperCase(), enc(url), enc(Object.keys(all).sort().map((k) => `${enc(k)}=${enc(all[k])}`).join("&"))].join("&");
  o.oauth_signature = createHmac("sha1", `${enc(secret)}&${enc(tokenSecret)}`).update(base).digest("base64");
  return "OAuth " + Object.keys(o).sort().map((k) => `${enc(k)}="${enc(o[k])}"`).join(", ");
}
if (has("selftest")) { // worked example from X's "Creating a signature" documentation
  const h = oauthHeader({ method: "POST", url: "https://api.twitter.com/1.1/statuses/update.json", params: { include_entities: "true", status: "Hello Ladies + Gentlemen, a signed OAuth request!" },
    key: "xvz1evFS4wEEPTGEFPHBog", secret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw", token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE", nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", timestamp: 1318622958 });
  const ok = h.includes('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"');
  console.log(ok ? "selftest OK: signature matches X's documented example" : `selftest FAILED: ${h}`); process.exit(ok ? 0 : 1);
}

// ---------- the post ----------
const URL_ = arg("url", process.env.APP_URL ?? "http://localhost:3000"), LANG = arg("lang", process.env.X_LANG ?? "en"), DRY = has("dry-run"), NO_IMAGE = has("no-image");
const creds = { key: process.env.X_API_KEY, secret: process.env.X_API_SECRET, token: process.env.X_ACCESS_TOKEN, tokenSecret: process.env.X_ACCESS_SECRET };
if (!DRY && Object.values(creds).some((v) => !v)) { console.error("missing X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET (use --dry-run to preview)"); process.exit(1); }

const m = await fetch(`${URL_}/api/metrics`).then((r) => r.json());
const last = await fetch(`${URL_}/api/stones?n=1`).then((r) => r.json());
const top = last.stones?.at(-1);
const height = (m.towerStones * m.stoneCm / 100).toFixed(2), today = m.days.at(-1)?.stones ?? 0;
const day0 = process.env.X_DAY0 ? Date.parse(process.env.X_DAY0) : null; const dayN = day0 ? Math.floor((Date.now() - day0) / 86_400_000) + 1 : null;
const site = (process.env.X_SITE_URL ?? process.env.APP_URL ?? URL_).replace(/\/$/, "");
const TEXT = {
  en: `${dayN ? `Day ${dayN}: ` : ""}the tower is ${height} m. ${today ? `+${today} stones today. ` : ""}${top?.name ? `${top.name} stacked the top stone.` : ""}\n\nStack yours → ${site}`,
  ko: `${dayN ? `${dayN}일째: ` : ""}탑 ${height} m. ${today ? `오늘 +${today}개. ` : ""}${top?.name ? `맨 위 돌은 ${top.name}님이 올렸습니다.` : ""}\n\n내 돌 올리기 → ${site}`,
};
const text = (TEXT[LANG] ?? TEXT.en).replace(/ +\n/g, "\n").trim();

// screenshot of the tower (portrait 4:5), deterministic via the page's video mode
let image = null;
if (!NO_IMAGE) {
  try {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
    const p = await b.newPage({ viewport: { width: 540, height: 675 }, deviceScaleFactor: 2 });
    await p.goto(`${URL_}/?video=1&lang=${LANG}`, { waitUntil: "load" }); await p.waitForFunction(() => window.__video?.ready, null, { timeout: 60_000 });
    for (let i = 0; i < 24; i++) await p.evaluate(() => window.__video.step(1 / 24)); // let the camera settle
    image = await p.screenshot({ type: "png" }); await b.close();
  } catch (e) { console.warn("no screenshot (playwright unavailable?):", e.message.slice(0, 120)); }
}
if (DRY) { console.log("--- would post ---\n" + text); if (image) { mkdirSync("out", { recursive: true }); writeFileSync("out/x-post.png", image); console.log("--- image saved to out/x-post.png"); } process.exit(0); }

async function xfetch(path, { method = "POST", body, form } = {}) {
  const url = `${API}${path}`;
  const headers = { Authorization: oauthHeader({ method, url, ...creds }) };
  let payload = body;
  if (form) { payload = new FormData(); for (const [k, v] of Object.entries(form)) payload.append(k, v); } else if (body) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const r = await fetch(url, { method, headers, body: payload });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}
let media_ids;
if (image) {
  const up = await xfetch("/2/media/upload", { form: { media: new Blob([image], { type: "image/png" }), media_category: "tweet_image" } });
  media_ids = [up.data?.id ?? up.media_id_string ?? up.id];
}
const post = await xfetch("/2/tweets", { body: { text, ...(media_ids ? { media: { media_ids } } : {}) } });
console.log(`posted ${post.data?.id}: ${text.split("\n")[0]}`);
