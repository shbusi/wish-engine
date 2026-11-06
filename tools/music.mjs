#!/usr/bin/env node
// Background music: public-domain Mozart recordings from Wikimedia Commons, listed in tools/music-sources.json
// (title, performer, licence, source page, direct file URL). The files are not committed: this script downloads the
// ones that are missing into the music directory, and the server runs it in the background at boot.
//   node tools/music.mjs [dir]          default: assets/music (or /data/music when DB_PATH is under /data)
import { mkdirSync, existsSync, statSync, writeFileSync, readFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
export const SOURCES = JSON.parse(readFileSync(join(HERE, "music-sources.json"), "utf8"));
export const defaultDir = () => process.env.MUSIC_DIR ?? ((process.env.DB_PATH ?? "").startsWith("/data") ? "/data/music" : join(HERE, "..", "assets", "music"));
const UA = "WishCairnMusic/1.0 (https://github.com/shbusi/wish-engine)";

/** Download every track that is missing (or truncated). Never throws: a failed track is skipped and reported. */
export async function ensure(dir = defaultDir(), log = console.log) {
  mkdirSync(dir, { recursive: true });
  const done = [], failed = [];
  for (const t of SOURCES) {
    const file = join(dir, t.file);
    if (existsSync(file) && (!t.bytes || statSync(file).size === t.bytes)) { done.push(t.file); continue; }
    try {
      const r = await fetch(t.url, { headers: { "User-Agent": UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (t.bytes && buf.length !== t.bytes) throw new Error(`size ${buf.length} != ${t.bytes}`);
      writeFileSync(file + ".part", buf); renameSync(file + ".part", file); done.push(t.file); log(`music: fetched ${t.file} (${(buf.length / 1e6).toFixed(1)} MB)`);
    } catch (e) { failed.push(t.file); log(`music: ${t.file} failed: ${e.message}`); }
  }
  return { dir, done, failed };
}
/** The playlist as the page sees it: only tracks whose file is present, in the listed order. */
export function playlist(dir = defaultDir()) {
  return SOURCES.filter((t) => { try { return existsSync(join(dir, t.file)) && (!t.bytes || statSync(join(dir, t.file)).size === t.bytes); } catch { return false; } })
    .map((t) => ({ file: t.file, title: t.title, work: t.work, performer: t.performer, license: t.license, source: t.source, seconds: t.seconds ?? null }));
}
if (process.argv[1] && process.argv[1].endsWith("music.mjs")) {
  const r = await ensure(process.argv[2] ?? defaultDir());
  console.log(`music: ${r.done.length} ready, ${r.failed.length} failed, in ${r.dir}`);
  if (r.failed.length) process.exit(1);
}
