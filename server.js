// 소원 돌탑 — one shared tower, zero dependencies.
// node >= 22.13 (built-in SQLite). Run: node server.js
import http from "node:http";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? "cairn.db";
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------- storage ----------
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS stones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    wish TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);
const qInsert = db.prepare("INSERT INTO stones (name, wish, created_at) VALUES (?, ?, ?)");
const qRecent = db.prepare("SELECT id, name, wish, created_at FROM stones ORDER BY id DESC LIMIT ?");
const qAfter = db.prepare("SELECT id, name, wish, created_at FROM stones WHERE id > ? ORDER BY id ASC LIMIT ?");
const qCount = db.prepare("SELECT COUNT(*) AS n FROM stones");
const qOne = db.prepare("SELECT id, name, wish, created_at FROM stones WHERE id = ?");

export function addStone({ name, wish }) {
  const cleanWish = String(wish ?? "").replace(/\s+/g, " ").trim();
  const cleanName = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
  if (cleanWish.length < 2) throw Object.assign(new Error("too_short"), { status: 400 });
  if (cleanWish.length > 140) throw Object.assign(new Error("too_long"), { status: 400 });
  if (/https?:\/\/|www\./i.test(cleanWish + cleanName)) throw Object.assign(new Error("rejected"), { status: 400 });
  const r = qInsert.run(cleanName || null, cleanWish, Date.now());
  return qOne.get(Number(r.lastInsertRowid));
}
export const count = () => qCount.get().n;
export const recent = (n = 40) => qRecent.all(Math.min(Math.max(1, n), 200)).reverse();
export const after = (id, n = 100) => qAfter.all(Number(id) || 0, Math.min(n, 500));

// ---------- realtime (SSE) ----------
const clients = new Set();
function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(line);
}
setInterval(() => broadcast({ type: "presence", watching: clients.size }), 10_000).unref();

// ---------- rate limit: RATE_PER_MIN stones / minute / ip (default 5) ----------
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN ?? 5);
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= RATE_PER_MIN) return true;
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

// ---------- http ----------
const INDEX = readFileSync(path.join(HERE, "index.html"));
const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

export const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "?";

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(INDEX);
  }

  if (req.method === "GET" && url.pathname === "/api/stones") {
    const a = url.searchParams.get("after");
    return json(res, 200, { total: count(), stones: a ? after(a) : recent(Number(url.searchParams.get("n") ?? 40)) });
  }

  if (req.method === "POST" && url.pathname === "/api/stones") {
    if (limited(ip)) return json(res, 429, { error: "rate_limited" });
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on("end", () => {
      try {
        const stone = addStone(JSON.parse(body || "{}"));
        broadcast({ type: "stone", stone, total: count() });
        json(res, 201, { stone, total: count() });
      } catch (e) {
        json(res, e.status ?? 400, { error: e.message });
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.write(`data: ${JSON.stringify({ type: "hello", total: count(), watching: clients.size + 1 })}\n\n`);
    clients.add(res);
    broadcast({ type: "presence", watching: clients.size });
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.on("close", () => { clearInterval(ping); clients.delete(res); broadcast({ type: "presence", watching: clients.size }); });
    return;
  }

  res.writeHead(404);
  res.end();
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => console.log(`소원 돌탑 · http://localhost:${PORT} · ${count()} stones`));
}
