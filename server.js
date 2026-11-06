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
export const FREE_BLESS_PER_DAY = Number(process.env.FREE_BLESS_PER_DAY ?? 3); // blessings a wallet may give per day before they cost a stone
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
try { db.exec("ALTER TABLE pending_chain ADD COLUMN sealed INTEGER NOT NULL DEFAULT 0"); } catch {}
// Sealed wishes: the text stays private to the owner (costs one stone). Blessings: others send a light to a stone.
try { db.exec("ALTER TABLE stones ADD COLUMN sealed INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE stones ADD COLUMN blessings INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE wallets ADD COLUMN bless_day INTEGER NOT NULL DEFAULT 0"); } catch {}   // day index of the free-blessing counter
try { db.exec("ALTER TABLE wallets ADD COLUMN bless_n INTEGER NOT NULL DEFAULT 0"); } catch {}     // free blessings given on bless_day
try { db.exec("ALTER TABLE wallets ADD COLUMN seen_bless INTEGER NOT NULL DEFAULT 0"); } catch {}  // last time the owner was told about new blessings (ms)
db.exec(`CREATE TABLE IF NOT EXISTS blessings (stone_id INTEGER NOT NULL, wallet_id INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (stone_id, wallet_id))`);
// Visits: one row per page load (client-generated id), with source and time on page. Feeds /api/analytics.
db.exec(`CREATE TABLE IF NOT EXISTS visits (id TEXT PRIMARY KEY, wallet_id INTEGER, day INTEGER NOT NULL, source TEXT, path TEXT, lang TEXT, seconds INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`);
db.exec("CREATE INDEX IF NOT EXISTS visits_day ON visits(day)");
const q = {
  insert: db.prepare("INSERT INTO stones (name, wish, wallet_id, paid, sealed, created_at) VALUES (?, ?, ?, ?, ?, ?)"),
  spendCredit: db.prepare("UPDATE wallets SET credits = credits - 1 WHERE id = ? AND credits >= 1"),
  stoneFull: db.prepare("SELECT * FROM stones WHERE id = ?"),
  bless: db.prepare("INSERT OR IGNORE INTO blessings (stone_id, wallet_id, created_at) VALUES (?, ?, ?)"),
  unbless: db.prepare("DELETE FROM blessings WHERE stone_id = ? AND wallet_id = ?"),
  countBless: db.prepare("UPDATE stones SET blessings = blessings + 1 WHERE id = ?"),
  blessDay: db.prepare("UPDATE wallets SET bless_day = ?, bless_n = ? WHERE id = ?"),
  blessedByMe: db.prepare("SELECT stone_id FROM blessings WHERE wallet_id = ? ORDER BY created_at DESC LIMIT 500"),
  myBlessings: db.prepare("SELECT COUNT(*) AS n FROM blessings b JOIN stones s ON s.id = b.stone_id WHERE s.wallet_id = ? AND b.created_at > ?"),
  seenBless: db.prepare("UPDATE wallets SET seen_bless = ? WHERE id = ?"),
  insertBot: db.prepare("INSERT INTO stones (name, wish, wallet_id, paid, bot, created_at) VALUES (?, ?, NULL, 0, 1, ?)"),
  insertChain: db.prepare("INSERT OR IGNORE INTO stones (name, wish, wallet_id, paid, bot, chain_id, sealed, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)"),
  byChain: db.prepare("SELECT id FROM stones WHERE chain_id = ?"),
  pendingPut: db.prepare("INSERT OR REPLACE INTO pending_chain (wish_hash, wish, name, wallet_id, sealed, created_at) VALUES (?, ?, ?, ?, ?, ?)"),
  pendingGet: db.prepare("SELECT * FROM pending_chain WHERE wish_hash = ?"),
  pendingDel: db.prepare("DELETE FROM pending_chain WHERE wish_hash = ?"),
  lastChain: db.prepare("SELECT MAX(chain_id) AS n FROM stones"),
  botCount: db.prepare("SELECT COUNT(*) AS n FROM stones WHERE bot = 1"),
  // investor metrics: visitor stones only (seeded stones are excluded, never labelled)
  mDays: db.prepare("SELECT (created_at / 86400000) AS d, COUNT(*) AS n, COUNT(DISTINCT wallet_id) AS w, SUM(paid) AS p FROM stones WHERE bot = 0 AND created_at > ? GROUP BY d ORDER BY d"),
  mTotals: db.prepare("SELECT COUNT(*) AS stones, COUNT(DISTINCT wallet_id) AS wallets, SUM(paid) AS paid, SUM(sealed) AS sealed, SUM(CASE WHEN chain_id IS NOT NULL THEN 1 ELSE 0 END) AS onchain, SUM(blessings) AS blessings FROM stones WHERE bot = 0"),
  mReturning: db.prepare("SELECT COUNT(*) AS n FROM wallets WHERE placed >= 2"),
  mBuyers: db.prepare("SELECT COUNT(DISTINCT wallet_id) AS n, COALESCE(SUM(CAST(usd AS REAL)), 0) AS usd FROM orders WHERE status = 'PAID'"),
  // analytics
  visitPut: db.prepare("INSERT OR IGNORE INTO visits (id, wallet_id, day, source, path, lang, seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
  visitEnd: db.prepare("UPDATE visits SET seconds = MAX(seconds, ?) WHERE id = ? AND wallet_id = ?"),
  aVisits: db.prepare("SELECT day AS d, COUNT(*) AS visits, COUNT(DISTINCT wallet_id) AS uniques, AVG(seconds) AS secs FROM visits WHERE day >= ? GROUP BY day"),
  aNewWallets: db.prepare("SELECT (created_at / 86400000) AS d, COUNT(*) AS n FROM wallets WHERE created_at >= ? GROUP BY d"),
  aOrders: db.prepare("SELECT (created_at / 86400000) AS d, COUNT(*) AS created, SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paid, COALESCE(SUM(CASE WHEN status = 'PAID' THEN CAST(usd AS REAL) ELSE 0 END), 0) AS usd FROM orders WHERE created_at >= ? GROUP BY d"),
  aBless: db.prepare("SELECT (created_at / 86400000) AS d, COUNT(*) AS n FROM blessings WHERE created_at >= ? GROUP BY d"),
  aChain: db.prepare("SELECT (created_at / 86400000) AS d, COUNT(*) AS n FROM stones WHERE chain_id IS NOT NULL AND created_at >= ? GROUP BY d"),
  aSources: db.prepare("SELECT COALESCE(source, 'direct') AS source, COUNT(*) AS visits, COUNT(DISTINCT wallet_id) AS uniques FROM visits WHERE day >= ? GROUP BY source ORDER BY visits DESC LIMIT 20"),
  aCohort: db.prepare(`SELECT w.id, (w.created_at / 86400000) AS d0,
      EXISTS (SELECT 1 FROM visits v WHERE v.wallet_id = w.id AND v.day = (w.created_at / 86400000) + 1) OR EXISTS (SELECT 1 FROM stones s WHERE s.wallet_id = w.id AND (s.created_at / 86400000) = (w.created_at / 86400000) + 1) AS d1,
      EXISTS (SELECT 1 FROM visits v WHERE v.wallet_id = w.id AND v.day > (w.created_at / 86400000) AND v.day <= (w.created_at / 86400000) + 7) OR EXISTS (SELECT 1 FROM stones s WHERE s.wallet_id = w.id AND (s.created_at / 86400000) > (w.created_at / 86400000) AND (s.created_at / 86400000) <= (w.created_at / 86400000) + 7) AS d7,
      w.placed > 0 AS activated, EXISTS (SELECT 1 FROM orders o WHERE o.wallet_id = w.id AND o.status = 'PAID') AS paid
    FROM wallets w WHERE w.created_at >= ? AND w.created_at < ?`),
  recent: db.prepare("SELECT id, name, wish, sealed, blessings, wallet_id, created_at FROM stones ORDER BY id DESC LIMIT ?"),
  after: db.prepare("SELECT id, name, wish, sealed, blessings, wallet_id, created_at FROM stones WHERE id > ? ORDER BY id ASC LIMIT ?"),
  count: db.prepare("SELECT COUNT(*) AS n FROM stones"),
  today: db.prepare("SELECT COUNT(*) AS n FROM stones WHERE created_at > ?"),
  one: db.prepare("SELECT id, name, wish, sealed, blessings, wallet_id, created_at FROM stones WHERE id = ?"),
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
/** Public shape of a stone. A sealed wish's text is only returned to its owner; wallet ids never leave the server. */
export function pub(row, viewerId = null) {
  if (!row) return row;
  const { wallet_id, ...s } = row;
  if (s.sealed && wallet_id !== viewerId) s.wish = null;
  return s;
}
export const recent = (n = 40, viewerId = null) => q.recent.all(Math.min(Math.max(1, n), 200)).reverse().map((r) => pub(r, viewerId));
export const after = (id, n = 100, viewerId = null) => q.after.all(Number(id) || 0, Math.min(n, 500)).map((r) => pub(r, viewerId));
export const stoneById = (id, viewerId = null) => pub(q.one.get(Number(id) || 0), viewerId);
export const botCount = () => q.botCount.get().n;

/** A stone stacked on-chain (from the indexer). The wish text comes from the pending record the page registered. */
export function addChainStone({ tokenId, name, wishHash, free, at }) {
  if (q.byChain.get(tokenId)) return null;
  const p = q.pendingGet.get(wishHash);
  const wish = p?.wish ?? "(a wish sealed on-chain)";
  const r = q.insertChain.run((p?.name ?? name ?? "").slice(0, 20) || null, wish, p?.wallet_id ?? null, free ? 0 : 1, tokenId, p ? p.sealed : 1, at ?? Date.now());
  if (p) q.pendingDel.run(wishHash);
  if (r.changes === 0) return null;
  const stone = pub(q.one.get(Number(r.lastInsertRowid)));
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
  return pub(q.one.get(Number(r.lastInsertRowid)));
}

// ---------- wallets ----------
export function createWallet() {
  const token = randomBytes(18).toString("base64url");
  const r = q.newWallet.run(token, Date.now());
  return q.walletById.get(Number(r.lastInsertRowid));
}
export const walletByToken = (t) => (t ? q.walletByToken.get(t) : undefined);
const dayOf = (ms) => Math.floor(ms / 86_400_000);
export function walletState(w, now = Date.now()) {
  const blessFreeLeft = w.bless_day === dayOf(now) ? Math.max(0, FREE_BLESS_PER_DAY - w.bless_n) : FREE_BLESS_PER_DAY;
  return { credits: w.credits, placed: w.placed, freeNow: w.free_at <= now, nextFreeAt: w.free_at > now ? w.free_at : null, liftedCm: w.placed * STONE_CM, blessFreeLeft, blessed: q.blessedByMe.all(w.id).map((r) => r.stone_id) };
}
/** Blessings on this wallet's stones since it last asked, then mark them seen. */
export function newBlessings(w, now = Date.now()) {
  const fresh = q.walletById.get(w.id);
  const n = q.myBlessings.get(fresh.id, fresh.seen_bless).n;
  if (n) q.seenBless.run(now, fresh.id);
  return n;
}

/** Place a stone for a wallet: free if available, else one credit. Sealing (private wish) costs one more credit. Throws 402 need_credits. */
export function addStone(wallet, { name, wish, sealed }, now = Date.now()) {
  const cleanWish = String(wish ?? "").replace(/\s+/g, " ").trim();
  const cleanName = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
  if (cleanWish.length < 2) throw Object.assign(new Error("too_short"), { status: 400 });
  if (cleanWish.length > 140) throw Object.assign(new Error("too_long"), { status: 400 });
  if (/https?:\/\/|www\./i.test(cleanWish + cleanName)) throw Object.assign(new Error("rejected"), { status: 400 });
  const seal = sealed ? 1 : 0;
  const fresh = q.walletById.get(wallet.id);
  if (fresh.credits < (fresh.free_at <= now ? 0 : 1) + seal) throw Object.assign(new Error("need_credits"), { status: 402 }); // check before spending anything
  let paid = 0;
  if (q.useFree.run(now + FREE_EVERY_MS, wallet.id, now).changes === 0) {
    if (q.useCredit.run(wallet.id).changes === 0) throw Object.assign(new Error("need_credits"), { status: 402 });
    paid = 1;
  }
  if (seal && q.spendCredit.run(wallet.id).changes === 0) throw Object.assign(new Error("need_credits"), { status: 402 });
  const r = q.insert.run(cleanName || null, cleanWish, wallet.id, paid, seal, now);
  return { stone: pub(q.one.get(Number(r.lastInsertRowid)), wallet.id), wallet: walletState(q.walletById.get(wallet.id), now) };
}

/** Send a light to someone else's stone. FREE_BLESS_PER_DAY are free each day, then one credit each. Once per stone per wallet. */
export function bless(wallet, stoneId, now = Date.now()) {
  const st = q.stoneFull.get(Number(stoneId) || 0);
  if (!st) throw Object.assign(new Error("not_found"), { status: 404 });
  if (st.wallet_id === wallet.id) throw Object.assign(new Error("own_stone"), { status: 400 });
  if (q.bless.run(st.id, wallet.id, now).changes === 0) throw Object.assign(new Error("already_blessed"), { status: 409 });
  const w = q.walletById.get(wallet.id), today = dayOf(now), used = w.bless_day === today ? w.bless_n : 0;
  let free = true;
  if (used < FREE_BLESS_PER_DAY) q.blessDay.run(today, used + 1, wallet.id);
  else if (q.spendCredit.run(wallet.id).changes === 1) free = false;
  else { q.unbless.run(st.id, wallet.id); throw Object.assign(new Error("need_credits"), { status: 402 }); }
  q.countBless.run(st.id);
  const stone = pub(q.one.get(st.id));
  broadcast({ type: "bless", id: stone.id, blessings: stone.blessings });
  return { stone, free, wallet: walletState(q.walletById.get(wallet.id), now) };
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
let metricsCache = { at: 0, v: null };
/** Public growth metrics for the investor page. Cached a minute. */
export function metrics(now = Date.now()) {
  if (metricsCache.v && now - metricsCache.at < 60_000) return metricsCache.v;
  const DAYS = 14, from = now - DAYS * 86_400_000, today = Math.floor(now / 86_400_000);
  const rows = new Map(q.mDays.all(from).map((r) => [r.d, r]));
  const days = Array.from({ length: DAYS }, (_, i) => { const d = today - DAYS + 1 + i; const r = rows.get(d); return { day: new Date(d * 86_400_000).toISOString().slice(0, 10), stones: r?.n ?? 0, wallets: r?.w ?? 0, paid: r?.p ?? 0 }; });
  const t = q.mTotals.get(), buyers = q.mBuyers.get();
  const v = { days, totals: { stones: t.stones, wallets: t.wallets, paid: t.paid ?? 0, sealed: t.sealed ?? 0, onchain: t.onchain ?? 0, blessings: t.blessings ?? 0, returning: q.mReturning.get().n, buyers: buyers.n, revenueUsd: Math.round(buyers.usd * 100) / 100 }, towerStones: count(), stoneCm: STONE_CM, at: now };
  metricsCache = { at: now, v };
  return v;
}
/** Record a page view (sendBeacon from the page). Same id twice = the end-of-visit beacon with seconds on page. */
export function recordVisit(wallet, { id, ref, q: query, path, lang, seconds }, now = Date.now()) {
  const vid = String(id ?? "").slice(0, 40); if (!/^[A-Za-z0-9_-]{8,40}$/.test(vid)) return false;
  let source = null;
  try { const u = new URLSearchParams(String(query ?? "")); source = (u.get("utm_source") || u.get("ref") || "").slice(0, 60) || null; } catch {}
  if (!source && ref) { try { const h = new URL(String(ref)).hostname; source = h && h !== new URL(APP_URL()).hostname && !/^(localhost|127\.)/.test(h) ? h.replace(/^www\./, "").slice(0, 60) : null; } catch {} }
  const secs = Math.min(3600, Math.max(0, Math.round(Number(seconds) || 0)));
  q.visitPut.run(vid, wallet.id, Math.floor(now / 86_400_000), source, String(path ?? "/").slice(0, 40), String(lang ?? "").slice(0, 8), secs, now);
  if (secs) q.visitEnd.run(secs, vid, wallet.id);
  return true;
}

let analyticsCache = new Map();
/** Daily series + KPIs + growth + retention + funnel. `admin` adds traffic sources. Cached a minute per (days, admin). */
export function analytics(days = 30, admin = false, now = Date.now()) {
  const key = `${days}:${admin}`, c = analyticsCache.get(key); if (c && now - c.at < 60_000) return c.v;
  days = Math.min(365, Math.max(7, Number(days) || 30));
  const today = Math.floor(now / 86_400_000), from = today - days + 1, fromMs = from * 86_400_000;
  const byDay = (rows) => new Map(rows.map((r) => [r.d, r]));
  const V = byDay(q.aVisits.all(from)), N = byDay(q.aNewWallets.all(fromMs)), O = byDay(q.aOrders.all(fromMs)), B = byDay(q.aBless.all(fromMs)), C = byDay(q.aChain.all(fromMs)), S = byDay(q.mDays.all(fromMs));
  const series = Array.from({ length: days }, (_, i) => { const d = from + i; return { day: new Date(d * 86_400_000).toISOString().slice(0, 10),
    visits: V.get(d)?.visits ?? 0, uniques: V.get(d)?.uniques ?? 0, secs: Math.round(V.get(d)?.secs ?? 0), newWallets: N.get(d)?.n ?? 0,
    stones: S.get(d)?.n ?? 0, wishers: S.get(d)?.w ?? 0, paidStones: S.get(d)?.p ?? 0, ordersCreated: O.get(d)?.created ?? 0, ordersPaid: O.get(d)?.paid ?? 0, revenue: Math.round((O.get(d)?.usd ?? 0) * 100) / 100,
    blessings: B.get(d)?.n ?? 0, onchain: C.get(d)?.n ?? 0 }; });
  const sum = (k, rows) => rows.reduce((a, r) => a + r[k], 0);
  const last7 = series.slice(-7), prev7 = series.slice(-14, -7);
  const growth = {}; for (const k of ["visits", "uniques", "stones", "wishers", "revenue", "newWallets", "blessings"]) { const a = sum(k, last7), b = sum(k, prev7); growth[k] = { last7: Math.round(a * 100) / 100, prev7: Math.round(b * 100) / 100, pct: b ? Math.round((a - b) / b * 1000) / 10 : null }; }
  // retention: cohorts that are at least 8 days old (so D7 is observable), within the window
  const coh = q.aCohort.all(fromMs, (today - 7) * 86_400_000);
  const rate = (k) => coh.length ? Math.round(coh.filter((r) => r[k]).length / coh.length * 1000) / 10 : null;
  const retention = { cohort: coh.length, d1: rate("d1"), d7: rate("d7") };
  // funnel over the whole window: wallets created → placed a stone → paid
  const all = q.aCohort.all(fromMs, now + 1);
  const funnel = { wallets: all.length, activated: all.filter((r) => r.activated).length, paid: all.filter((r) => r.paid).length };
  const totalSecs = series.reduce((a, r) => a + r.secs * r.visits, 0), totalVisits = sum("visits", series);
  const v = { days, series, growth, retention, funnel, avgSeconds: totalVisits ? Math.round(totalSecs / totalVisits) : 0, totals: metrics(now).totals, towerStones: count(), stoneCm: STONE_CM, at: now, sources: admin ? q.aSources.all(from) : undefined };
  analyticsCache.set(key, { at: now, v });
  return v;
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
    if (req.method === "GET" && url.pathname === "/investors") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      return res.end(page("investors.html"));
    }
    if (req.method === "GET" && url.pathname === "/analytics") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      return res.end(page("analytics.html"));
    }
    if (req.method === "POST" && url.pathname === "/api/visit") {
      const [w, setCookie] = wallet(req);
      let body = {}; try { body = await readBody(req); } catch {}
      recordVisit(w, body);
      return json(res, 200, { ok: true }, setCookie ? { "Set-Cookie": setCookie } : {});
    }
    if (req.method === "GET" && url.pathname === "/api/analytics") {
      const admin = !!process.env.ADMIN_TOKEN && (req.headers["x-admin-token"] === process.env.ADMIN_TOKEN || url.searchParams.get("token") === process.env.ADMIN_TOKEN);
      return json(res, 200, { ...analytics(url.searchParams.get("days"), admin), admin, chain: chainPublic() }, { "Cache-Control": "no-store" });
    }
    if (req.method === "GET" && url.pathname === "/api/analytics.csv") {
      if (!process.env.ADMIN_TOKEN || (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN && url.searchParams.get("token") !== process.env.ADMIN_TOKEN)) return json(res, 401, { error: "unauthorized" });
      const a = analytics(url.searchParams.get("days") ?? 90, true), cols = Object.keys(a.series[0]);
      res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=wish-cairn-analytics.csv" });
      return res.end([cols.join(","), ...a.series.map((r) => cols.map((c) => r[c]).join(","))].join("\n"));
    }
    if (req.method === "GET" && url.pathname === "/api/metrics") return json(res, 200, { ...metrics(), chain: chainPublic() }, { "Cache-Control": "public, max-age=60" });
    if (url.pathname === "/wallet.js" || url.pathname === "/i18n.js") {
      res.writeHead(200, { "Content-Type": MIME[".js"], "Cache-Control": "no-cache" });
      return res.end(page(url.pathname.slice(1)));
    }

    if (req.method === "GET" && url.pathname === "/api/me") {
      const [w, setCookie] = wallet(req);
      return json(res, 200, { wallet: walletState(w), newBlessings: newBlessings(w), pack: PACK, providers: enabledProviders(), chain: chainPublic(), ...stats() }, setCookie ? { "Set-Cookie": setCookie } : {});
    }

    // ---- on-chain stacking: register the wish text (only its hash goes on-chain), get a free-stone voucher
    if (req.method === "POST" && url.pathname === "/api/chain/prepare") {
      if (!chain()) return json(res, 404, { error: "no_chain" });
      if (limited(ip, "prep", 20)) return json(res, 429, { error: "rate_limited" });
      const [w, setCookie] = wallet(req);
      const { wish, name, address, wantFree, sealed } = await readBody(req);
      const cleanWish = String(wish ?? "").replace(/\s+/g, " ").trim();
      const cleanName = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
      if (cleanWish.length < 2 || cleanWish.length > 140 || /https?:\/\/|www\./i.test(cleanWish + cleanName)) return json(res, 400, { error: "rejected" });
      if (!/^0x[0-9a-fA-F]{40}$/.test(String(address ?? ""))) return json(res, 400, { error: "bad_address" });
      const { wishHash, salt } = preparePending(cleanWish);
      q.pendingPut.run(wishHash, cleanWish, cleanName || null, w.id, sealed ? 1 : 0, Date.now());
      let voucher = null;
      // The daily free stone works on-chain too: consume the web2 free slot and hand back a signed voucher.
      if (wantFree && w.free_at <= Date.now() && q.useFree.run(Date.now() + FREE_EVERY_MS, w.id, Date.now()).changes === 1) voucher = await signVoucher(address);
      return json(res, 200, { wishHash, salt, name: cleanName, voucher, wallet: walletState(q.walletById.get(w.id)) }, setCookie ? { "Set-Cookie": setCookie } : {});
    }

    if (req.method === "GET" && url.pathname === "/api/stones") {
      const a = url.searchParams.get("after"), id = url.searchParams.get("id");
      const viewer = walletByToken(cookieOf(req, WALLET_COOKIE))?.id ?? null; // owners see their own sealed wishes
      if (id) { const s = stoneById(id, viewer); return s ? json(res, 200, { stone: s }) : json(res, 404, { error: "not_found" }); }
      return json(res, 200, { ...stats(), stones: a ? after(a, 100, viewer) : recent(Number(url.searchParams.get("n") ?? 40), viewer) });
    }

    if (req.method === "POST" && url.pathname === "/api/stones") {
      if (limited(ip, "stone")) return json(res, 429, { error: "rate_limited" });
      const [w, setCookie] = wallet(req);
      const body = await readBody(req);
      try {
        const r = addStone(w, body);
        broadcast({ type: "stone", stone: pub(q.one.get(r.stone.id)), ...stats() }); // everyone else gets the public shape (sealed text hidden)
        return json(res, 201, { ...r, ...stats() }, setCookie ? { "Set-Cookie": setCookie } : {});
      } catch (e) {
        return json(res, e.status ?? 400, { error: e.message, wallet: walletState(w), pack: PACK, providers: enabledProviders() }, setCookie ? { "Set-Cookie": setCookie } : {});
      }
    }

    // Bless someone's stone: POST /api/stones/<id>/bless
    const mb = req.method === "POST" && url.pathname.match(/^\/api\/stones\/(\d+)\/bless$/);
    if (mb) {
      if (limited(ip, "bless", 30)) return json(res, 429, { error: "rate_limited" });
      const [w, setCookie] = wallet(req);
      try { return json(res, 200, bless(w, mb[1]), setCookie ? { "Set-Cookie": setCookie } : {}); }
      catch (e) { return json(res, e.status ?? 400, { error: e.message, wallet: walletState(w), pack: PACK, providers: enabledProviders() }, setCookie ? { "Set-Cookie": setCookie } : {}); }
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
    // X autopost: X_AUTOPOST=HH:MM (UTC) runs tools/post-x.mjs once a day with the X_* keys from the environment.
if (process.env.X_AUTOPOST && process.env.X_API_KEY) {
  const [hh, mm] = process.env.X_AUTOPOST.split(":").map(Number);
  let lastDay = null;
  setInterval(() => {
    const d = new Date(); if (d.getUTCHours() !== hh || d.getUTCMinutes() !== mm || lastDay === d.getUTCDate()) return;
    lastDay = d.getUTCDate();
    import("node:child_process").then(({ spawn }) => { const c = spawn(process.execPath, [path.join(HERE, "tools", "post-x.mjs"), "--url", `http://127.0.0.1:${PORT}`], { stdio: "inherit", env: process.env }); c.on("exit", (code) => console.log(`x autopost exit ${code}`)); });
  }, 30_000).unref();
  console.log(`x autopost daily at ${process.env.X_AUTOPOST} UTC`);
}
if (chain()) startIndexer({ onStacked: addChainStone, fromTokenId: lastChainId() + 1 });
  });
}
