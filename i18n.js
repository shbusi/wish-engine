// Language selection shared by every page: ?lang= → saved choice → the browser's languages → English.
// Pages pass the languages they actually have; a visitor from Brazil sees Portuguese on the tower but English on
// the investor pages (which only exist in en/ko) until those are translated.
const KEY = "cairn_lang";
const norm = (tag) => { const t = String(tag || "").toLowerCase(); return t.startsWith("zh") ? "zh" : t.startsWith("pt") ? "pt" : t.split("-")[0]; };
export function pickLang(supported, { save = true } = {}) {
  const q = new URLSearchParams(location.search).get("lang");
  if (q && supported.includes(norm(q))) { if (save) try { localStorage.setItem(KEY, norm(q)); } catch {} return norm(q); }
  try { const s = localStorage.getItem(KEY); if (s && supported.includes(s)) return s; } catch {}
  for (const tag of navigator.languages ?? [navigator.language]) { const l = norm(tag); if (supported.includes(l)) return l; }
  return supported[0];
}
export function setLang(lang) { try { localStorage.setItem(KEY, lang); } catch {} const u = new URL(location.href); u.searchParams.set("lang", lang); location.href = u.toString(); }
/** Same path in another language, keeping other query params. */
export function langHref(path, lang) { const u = new URL(path, location.origin); if (lang !== "en") u.searchParams.set("lang", lang); return u.pathname + u.search; }
export const NAMES = { en: "English", ko: "한국어", ja: "日本語", es: "Español", pt: "Português", zh: "中文" };
