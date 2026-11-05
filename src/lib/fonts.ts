/**
 * Fonts for server-rendered wish cards (Satori via next/og).
 * We fetch per-text subsets from Google Fonts so CJK stays small, and cache them.
 * If the fetch fails the card still renders with the bundled Latin fallback.
 */
import type { Locale } from "./channels";

const FAMILY: Record<Locale, string> = {
  ko: "Noto Sans KR",
  ja: "Noto Sans JP",
  zh: "Noto Sans SC",
  en: "Noto Sans",
};

const cache = new Map<string, ArrayBuffer>();
const MAX_CACHE = 200;

export async function loadFont(locale: Locale, weight: 400 | 700, text: string): Promise<ArrayBuffer | null> {
  const family = FAMILY[locale] ?? FAMILY.en;
  // Dedupe characters to keep the subset URL short and the cache hit rate high.
  const chars = Array.from(new Set(Array.from(text + "Wish Engine 0123456789₩“”—…"))).sort().join("");
  const key = `${family}:${weight}:${chars}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(chars)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:30.0) Gecko/20100101 Firefox/30.0" }, cache: "no-store" },
    ).then((r) => (r.ok ? r.text() : ""));
    const url = css.match(/src: url\(([^)]+)\) format\('(?:woff|truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    const buf = await fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.arrayBuffer() : null));
    if (!buf) return null;
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, buf);
    return buf;
  } catch {
    return null;
  }
}

export function fontFamilyFor(locale: Locale): string {
  return FAMILY[locale] ?? FAMILY.en;
}

/** Pick the font locale from the script actually present in the text, falling back to the UI locale. */
export function detectFontLocale(text: string, fallback: Locale): Locale {
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(text)) return "ko";
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\u4e00-\u9fff]/.test(text)) return fallback === "ja" ? "ja" : "zh";
  return fallback;
}
