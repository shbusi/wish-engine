// Wish Cairn — one shared tower. Node >= 22.13 (built-in SQLite). Run: node server.js
//
// Economy: every visitor gets an anonymous wallet (cookie). One free stone per
// 24h; after that a stone costs one credit. Credits come in packs bought via
// PayPal (or the dev-only mock provider).
import http from "node:http";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chain, chainPublic, signVoucher, preparePending, startIndexer } from "./chain-link.js";

const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? "cairn.db";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = () => process.env.APP_URL ?? `http://localhost:${PORT}`;

export const STONE_CM = Number(process.env.STONE_CM ?? 9);          // how much one stone lifts the tower
export const FREE_EVERY_MS = Number(process.env.FREE_EVERY_HOURS ?? 24) * 3_600_000;
export const PACK = { stones: Number(process.env.PACK_STONES ?? 10), usd: process.env.PACK_PRICE_USD ?? "0.99" };
const PROVIDERS = (process.env.PAYMENT_PROVIDERS ?? (process.env.PAYPAL_CLIENT_ID ? "paypal" : "mock")).split(",").map((s) => s.trim()).filter(Boolean);
const MOCK_OK = process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCK_PAYMENTS === "1";

// ---------- storage ----------
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    credits INTEGER NOT NULL DEFAULT 0,
    free_at INTEGER NOT NULL DEFAULT 0,      -- next time a free stone is available (ms)
    placed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS stones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    wish TEXT NOT NULL,
    wallet_id INTEGER,
    paid INTEGER NOT NULL DEFAULT 0,          -- 0 = free daily stone, 1 = credit
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,                      -- our order id
    wallet_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    provider_ref TEXT,
    stones INTEGER NOT NULL,
    usd TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'CREATED',   -- CREATED | PAID | FAILED
    created_at INTEGER NOT NULL
  );
`);
try { db.exec("ALTER TABLE stones ADD COLUMN wallet_id INTEGER"); } catch {}
try { db.exec("ALTER TABLE stones ADD COLUMN paid INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE stones ADD COLUMN bot INTEGER NOT NULL DEFAULT 0"); } catch {} // seeded by tools/seed-users.mjs; never exposed by the API
try { db.exec("ALTER TABLE stones ADD COLUMN chain_id INTEGER"); } catch {}           // StoneCairn token id when the stone was stacked on-chain
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS stones_chain ON stones(chain_id)"); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS pending_chain (wish_hash TEXT PRIMARY KEY, wish TEXT NOT NULL, name TEXT, wallet_id INTEGER, created_at INTEGER NOT NULL)`);
const q = {
  insert: db.prepare("INSERT INTO stones (name, wish, wallet_id, paid, created_at) VALUES (?, ?, ?, ?, ?)"),
  insertBot: db.prepare("INSERT INTO stones (name, wish, wallet_id, paid, bot, created_at) VALUES (?, ?, NULL, 0, 1, ?)"),
  insertChain: db.prepare("INSERT OR IGNORE INTO stones (name, wish, wallet_id, paid, bot, chain_id, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)"),
  byChain: db.prepare("SELECT id FROM stones WHERE chain_id = ?"),
  pendingPut: db.prepare("INSERT OR REPLACE INTO pending_chain (wish_hash, wish, name, wallet_id, created_at) VALUES (?, ?, ?, ?, ?)"),
  pendingGet: db.prepare("SELECT * FROM pending_chain WHERE wish_hash = ?"),
  pendingDel: db.prepare("DELETE FROM pending_chain WHERE wish_hash = ?"),
  lastChain: db.prepare("SELECT MAX(chain_id) AS n FROM stones"),
  botCount: db.prepare("SELECT COUNT(*) AS n FROM stones WHERE bot = 1"),
  recent: db.prepare("SELECT id, name, wish, created_at FROM stones ORDER BY id DESC LIMIT ?"),
  after: db.prepare("SELECT id, name, wish, created_at FROM stones WHERE id > ? ORDER BY id ASC LIMIT ?"),
  count: db.prepare("SELECT COUNT(*) AS n FROM stones"),
  today: db.prepare("SELECT COUNT(*) AS n FROM stones WHERE created_at > ?"),
  one: db.prepare("SELECT id, name, wish, created_at FROM stones WHERE id = ?"),
  walletByToken: db.prepare("SELECT * FROM wallets WHERE token = ?"),
  walletById: db.prepare("SELECT * FROM wallets WHERE id = ?"),
  newWallet: db.prepare("INSERT INTO wallets (token, created_at) VALUES (?, ?)"),
  useFree: db.prepare("UPDATE wallets SET free_at = ?, placed = placed + 1 WHERE id = ? AND free_at <= ?"),
  useCredit: db.prepare("UPDATE wallets SET credits = credits - 1, placed = placed + 1 WHERE id = ? AND credits >= 1"),
  addCredits: db.prepare("UPDATE wallets SET credits = credits + ? WHERE id = ?"),
  newOrder: db.prepare("INSERT INTO orders (id, wallet_id, provider, provider_ref, stones, usd, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'CREATED', ?)"),
  order: db.prepare("SELECT * FROM orders WHERE id = ?"),
  orderByRef: db.prepare("SELECT * FROM orders WHERE provider = ? AND provider_ref = ?"),
  setOrder: db.prepare("UPDATE orders SET status = ?, provider_ref = COALESCE(?, provider_ref) WHERE id = ? AND status = 'CREATED'"),
};

export const count = () => q.count.get().n;
export const recent = (n = 40) => q.recent.all(Math.min(Math.max(1, n), 200)).reverse();
export const after = (id, n = 100) => q.after.all(Number(id) || 0, Math.min(n, 500));
export const stoneById = (id) => q.one.get(Number(id) || 0);
export const botCount = () => q.botCount.get().n;

/** A stone stacked on-chain (from the indexer). The wish text comes from the pending record the page registered. */
export function addChainStone({ tokenId, name, wishHash, free, at }) {
  if (q.byChain.get(tokenId)) return null;
  const p = q.pendingGet.get(wishHash);
  const wish = p?.wish ?? "(a wish sealed on-chain)";
  const r = q.insertChain.run((p?.name ?? name ?? "").slice(0, 20) || null, wish, p?.wallet_id ?? null, free ? 0 : 1, tokenId, at ?? Date.now());
  if (p) q.pendingDel.run(wishHash);
  if (r.changes === 0) return null;
  const stone = q.one.get(Number(r.lastInsertRowid));
  broadcast({ type: "stone", stone, ...stats() });
  return stone;
}
export const lastChainId = () => q.lastChain.get().n ?? 0;

/** Seed stone (virtual early user). `createdAt` in the past = backfill; omitted = now. */
export function addSeedStone({ name, wish, createdAt }) {
  const cleanWish = String(wish ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
  const cleanName = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
  if (cleanWish.length < 2) throw Object.assign(new Error("too_short"), { status: 400 });
  const r = q.insertBot.run(cleanName || null, cleanWish, Number(createdAt) || Date.now());
  return q.one.get(Number(r.lastInsertRowid));
}

// ---------- wallets ----------
export function createWallet() {
  const token = randomBytes(18).toString("base64url");
  const r = q.newWallet.run(token, Date.now());
  return q.walletById.get(Number(r.lastInsertRowid));
}
export const walletByToken = (t) => (t ? q.walletByToken.get(t) : undefined);
export function walletState(w, now = Date.now()) {
  return { credits: w.credits, placed: w.placed, freeNow: w.free_at <= now, nextFreeAt: w.free_at > now ? w.free_at : null, liftedCm: w.placed * STONE_CM };
}

/** Place a stone for a wallet: free if available, else one credit. Throws 402 need_credits. */
export function addStone(wallet, { name, wish }, now = Date.now()) {
  const cleanWish = String(wish ?? "").replace(/\s+/g, " ").trim();
  const cleanName = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
  if (cleanWish.length < 2) throw Object.assign(new Error("too_short"), { status: 400 });
  if (cleanWish.length > 140) throw Object.assign(new Error("too_long"), { status: 400 });
  if (/https?:\/\/|www\./i.test(cleanWish + cleanName)) throw Object.assign(new Error("rejected"), { status: 400 });
  let paid = 0;
  if (q.useFree.run(now + FREE_EVERY_MS, wallet.id, now).changes === 0) {
    if (q.useCredit.run(wallet.id).changes === 0) throw Object.assign(new Error("need_credits"), { status: 402 });
    paid = 1;
  }
  const r = q.insert.run(cleanName || null, cleanWish, wallet.id, paid, now);
  return { stone: q.one.get(Number(r.lastInsertRowid)), wallet: walletState(q.walletById.get(wallet.id), now) };
}

// ---------- payments ----------
async function paypalToken() {
  const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("paypal not configured");
  const base = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const r = await fetch(`${base}/v1/oauth2/token`, { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  if (!r.ok) throw new Error(`paypal auth ${r.status}`);
  return { base, token: (await r.json()).access_token };
}
const providers = {
  mock: {
    async checkout(order) { return { redirectUrl: `/pay/mock?order=${order.id}`, ref: `mock_${order.id}` }; },
  },
  paypal: {
    async checkout(order) {
      const { base, token } = await paypalToken();
      const r = await fetch(`${base}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": order.id },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ reference_id: order.id, description: `Wish Cairn: ${order.stones} stones`, amount: { currency_code: "USD", value: order.usd } }],
          payment_source: { paypal: { experience_context: { user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", brand_name: "Wish Cairn", return_url: `${APP_URL()}/api/paypal/return?order=${order.id}`, cancel_url: `${APP_URL()}/?cancelled=1` } } },
        }),
      });
      if (!r.ok) throw new Error(`paypal create ${r.status} ${await r.text()}`);
      const j = await r.json();
      const link = j.links.find((l) => l.rel === "payer-action" || l.rel === "approve");
      return { redirectUrl: link.href, ref: j.id };
    },
    async capture(ref) {
      const { base, token } = await paypalToken();
      const r = await fetch(`${base}/v2/checkout/orders/${ref}/capture`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": `cap_${ref}` } });
      const j = await r.json().catch(() => ({}));
      return r.ok && j.status === "COMPLETED";
    },
  },
};
export function enabledProviders() { return PROVIDERS.filter((p) => p in providers && (p !== "mock" || MOCK_OK)); }

export async function createOrder(wallet, providerId) {
  if (!enabledProviders().includes(providerId)) throw Object.assign(new Error("no_provider"), { status: 400 });
  const id = randomBytes(8).toString("hex");
  q.newOrder.run(id, wallet.id, providerId, null, PACK.stones, PACK.usd, Date.now());
  const order = q.order.get(id);
  const { redirectUrl, ref } = await providers[providerId].checkout(order);
  db.prepare("UPDATE orders SET provider_ref = ? WHERE id = ?").run(ref, id);
  return { id, redirectUrl };
}
/** Mark an order paid exactly once and credit the wallet. */
export function settleOrder(id, ok, ref = null) {
  const o = q.order.get(id);
  if (!o) return null;
  if (q.setOrder.run(ok ? "PAID" : "FAILED", ref, id).changes === 0) return q.order.get(id); // already settled
  if (ok) q.addCredits.run(o.stones, o.wallet_id);
  return q.order.get(id);
}

// ---------- realtime (SSE) ----------
const clients = new Set();
function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(line);
}
setInterval(() => broadcast({ type: "presence", watching: clients.size }), 10_000).unref();

// ---------- rate limit: RATE_PER_MIN requests / minute / ip ----------
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN ?? 5);
const hits = new Map();
function limited(ip, key = "", max = RATE_PER_MIN) {
  const now = Date.now(), k = ip + key;
  const arr = (hits.get(k) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= max) return true;
  arr.push(now); hits.set(k, arr);
  return false;
}

// ---------- static files ----------
const MIME = { ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".hdr": "application/octet-stream", ".glb": "model/gltf-binary", ".ktx2": "image/ktx2" };
const STATIC = [
  { prefix: "/vendor/three/", root: path.join(HERE, "node_modules", "three"), allow: /^(build|examples\/jsm)\// },
  { prefix: "/vendor/ethers/", root: path.join(HERE, "node_modules", "ethers"), allow: /^dist\/ethers\.min\.js$/ },
  { prefix: "/assets/", root: path.join(HERE, "assets"), allow: /^[^.]/ },
];
function serveStatic(req, res, url) {
  for (const s of STATIC) {
    if (!url.pathname.startsWith(s.prefix)) continue;
    const rel = path.posix.normalize(decodeURIComponent(url.pathname.slice(s.prefix.length)));
    if (rel.startsWith("..") || rel.includes("\0") || !s.allow.test(rel)) { res.writeHead(403); res.end(); return true; }
    try {
      const data = readFileSync(path.join(s.root, rel));
      res.writeHead(200, { "Content-Type": MIME[path.extname(rel)] ?? "application/octet-stream", "Cache-Control": s.prefix === "/assets/" ? "public, max-age=3600" : "public, max-age=31536000, immutable" });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
    return true;
  }
  return false;
}

// ---------- http ----------
const pageCache = new Map();
const page = (name) => { const f = path.join(HERE, name); return process.env.NODE_ENV === "production" ? (pageCache.get(f) ?? (pageCache.set(f, readFileSync(f)), pageCache.get(f))) : readFileSync(f); };
const index = () => page("index.html");
const json = (res, status, body, headers = {}) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > 4096) req.destroy(); }); req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } }); });
const cookieOf = (req, name) => req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
const WALLET_COOKIE = "cairn_w";
const cookieHeader = (token) => `${WALLET_COOKIE}=${token}; Path=/; Max-Age=${60 * 60 * 24 * 400}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
/** The visitor's wallet, minting one if needed. Returns [wallet, setCookieHeader|null]. */
function wallet(req) {
  const w = walletByToken(cookieOf(req, WALLET_COOKIE));
  if (w) return [w, null];
  const n = createWallet();
  return [n, cookieHeader(n.token)];
}
const stats = () => ({ total: count(), today: q.today.get(Date.now() - 86_400_000).n, stoneCm: STONE_CM });

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "?";
  try {
    if (req.method === "GET" && serveStatic(req, res, url)) return;

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      return res.end(index());
    }
    if (req.method === "GET" && url.pathname === "/invest") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      return res.end(page("invest.html"));
    }
    if (url.pathname === "/wallet.js") {
      res.writeHead(200, { "Content-Type": MIME[".js"], "Cache-Control": "no-cache" });
      return res.end(page("wallet.js"));
    }

    if (req.method === "GET" && url.pathname === "/api/me") {
      const [w, setCookie] = wallet(req);
      return json(res, 200, { wallet: walletState(w), pack: PACK, providers: enabledProviders(), chain: chainPublic(), ...stats() }, setCookie ? { "Set-Cookie": setCookie } : {});
    }

    // ---- on-chain stacking: register the wish text (only its hash goes on-chain), get a free-stone voucher
    if (req.method === "POST" && url.pathname === "/api/chain/prepare") {
      if (!chain()) return json(res, 404, { error: "no_chain" });
      if (limited(ip, "prep", 20)) return json(res, 429, { error: "rate_limited" });
      const [w, setCookie] = wallet(req);
      const { wish, name, address, wantFree } = await readBody(req);
      const cleanWish = String(wish ?? "").replace(/\s+/g, " ").trim();
      const cleanName = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
      if (cleanWish.length < 2 || cleanWish.length > 140 || /https?:\/\/|www\./i.test(cleanWish + cleanName)) return json(res, 400, { error: "rejected" });
      if (!/^0x[0-9a-fA-F]{40}$/.test(String(address ?? ""))) return json(res, 400, { error: "bad_address" });
      const { wishHash, salt } = preparePending(cleanWish);
      q.pendingPut.run(wishHash, cleanWish, cleanName || null, w.id, Date.now());
      let voucher = null;
      // The daily free stone works on-chain too: consume the web2 free slot and hand back a signed voucher.
      if (wantFree && w.free_at <= Date.now() && q.useFree.run(Date.now() + FREE_EVERY_MS, w.id, Date.now()).changes === 1) voucher = await signVoucher(address);
      return json(res, 200, { wishHash, salt, name: cleanName, voucher, wallet: walletState(q.walletById.get(w.id)) }, setCookie ? { "Set-Cookie": setCookie } : {});
    }

    if (req.method === "GET" && url.pathname === "/api/stones") {
      const a = url.searchParams.get("after"), id = url.searchParams.get("id");
      if (id) { const s = stoneById(id); return s ? json(res, 200, { stone: s }) : json(res, 404, { error: "not_found" }); }
      return json(res, 200, { ...stats(), stones: a ? after(a) : recent(Number(url.searchParams.get("n") ?? 40)) });
    }

    if (req.method === "POST" && url.pathname === "/api/stones") {
      if (limited(ip, "stone")) return json(res, 429, { error: "rate_limited" });
      const [w, setCookie] = wallet(req);
      const body = await readBody(req);
      try {
        const r = addStone(w, body);
        broadcast({ type: "stone", stone: r.stone, ...stats() });
        return json(res, 201, { ...r, ...stats() }, setCookie ? { "Set-Cookie": setCookie } : {});
      } catch (e) {
        return json(res, e.status ?? 400, { error: e.message, wallet: walletState(w), pack: PACK, providers: enabledProviders() }, setCookie ? { "Set-Cookie": setCookie } : {});
      }
    }

    // Operator-only: seed stones from tools/seed-users.mjs. Requires ADMIN_TOKEN.
    if (req.method === "POST" && url.pathname === "/api/admin/stones") {
      const token = process.env.ADMIN_TOKEN;
      if (!token || req.headers["x-admin-token"] !== token) return json(res, 401, { error: "unauthorized" });
      const body = await readBody(req);
      try {
        const stone = addSeedStone(body);
        const live = !body.createdAt || Date.now() - Number(body.createdAt) < 60_000;
        if (live) broadcast({ type: "stone", stone, ...stats() });
        return json(res, 201, { stone, ...stats() });
      } catch (e) { return json(res, e.status ?? 400, { error: e.message }); }
    }

    if (req.method === "POST" && url.pathname === "/api/buy") {
      if (limited(ip, "buy", 10)) return json(res, 429, { error: "rate_limited" });
      const [w, setCookie] = wallet(req);
      const { provider } = await readBody(req);
      try {
        const o = await createOrder(w, provider ?? enabledProviders()[0]);
        return json(res, 200, { orderId: o.id, redirectUrl: o.redirectUrl }, setCookie ? { "Set-Cookie": setCookie } : {});
      } catch (e) { console.error("buy failed", e); return json(res, e.status ?? 502, { error: e.status ? e.message : "checkout_failed" }); }
    }

    if (req.method === "GET" && url.pathname === "/api/paypal/return") {
      const id = url.searchParams.get("order"), ref = url.searchParams.get("token");
      const o = id && q.order.get(id);
      if (o && o.status === "CREATED" && o.provider === "paypal" && o.provider_ref === ref) settleOrder(id, await providers.paypal.capture(ref).catch(() => false));
      res.writeHead(302, { Location: `/?${o && q.order.get(id).status === "PAID" ? "bought=1" : "failed=1"}` }); return res.end();
    }

    if (url.pathname === "/pay/mock" && enabledProviders().includes("mock")) {
      const id = url.searchParams.get("order"); const o = id && q.order.get(id);
      if (!o) { res.writeHead(404); return res.end(); }
      if (req.method === "POST") { const { ok } = await readBody(req); settleOrder(id, !!ok, null); return json(res, 200, { status: q.order.get(id).status }); }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:system-ui;background:#0b0b16;color:#f3efe6;display:grid;place-items:center;height:100vh;margin:0"><div style="background:#15131f;padding:24px;border-radius:16px;max-width:360px"><h2>🧪 Test payment</h2><p>${o.stones} stones · $${o.usd}</p><p style="color:#a39d90;font-size:13px">Development only. No real money moves.</p><button onclick="go(true)" style="padding:10px 18px;border-radius:999px;border:0;background:#f0b35b;font-weight:700">Mark as paid</button> <button onclick="go(false)" style="padding:10px 18px;border-radius:999px;border:1px solid #444;background:none;color:#f3efe6">Fail</button></div><script>async function go(ok){await fetch(location.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ok})});location.href='/?'+(ok?'bought=1':'failed=1')}</script>`);
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.write(`data: ${JSON.stringify({ type: "hello", ...stats(), watching: clients.size + 1 })}\n\n`);
      clients.add(res);
      broadcast({ type: "presence", watching: clients.size });
      const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
      req.on("close", () => { clearInterval(ping); clients.delete(res); broadcast({ type: "presence", watching: clients.size }); });
      return;
    }

    res.writeHead(404); res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: "server_error" });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    console.log(`Wish Cairn · ${APP_URL()} · ${count()} stones · providers: ${enabledProviders().join(",") || "none"} · chain: ${chain() ? chain().network : "off"}`);
    if (chain()) startIndexer({ onStacked: addChainStone, fromTokenId: lastChainId() + 1 });
  });
}
