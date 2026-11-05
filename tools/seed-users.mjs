#!/usr/bin/env node
/**
 * Virtual early users. Makes the tower look alive before real people arrive.
 *
 *   ADMIN_TOKEN=… node tools/seed-users.mjs backfill --count 400 --days 14     # past stones, spread like real traffic
 *   ADMIN_TOKEN=… node tools/seed-users.mjs live --per-hour 6                  # keep stacking in real time (runs forever)
 *   node tools/seed-users.mjs preview --count 20                               # print wishes, write nothing
 *
 * Wishes come from Claude (ANTHROPIC_API_KEY, or `ant auth login`). Without
 * credentials it falls back to a built-in bank. Every seeded stone is stored
 * with bot=1 so you can always tell them apart from real users; the public
 * API never exposes the flag, and the "here now" count stays honest (it only
 * counts real open pages).
 *
 * Options: --url http://localhost:3000  --model claude-opus-5-5  --seed 7
 */
import Anthropic from "@anthropic-ai/sdk";

const args = process.argv.slice(2);
const mode = args[0] ?? "preview";
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const URL_ = opt("url", process.env.APP_URL ?? "http://localhost:3000");
const MODEL = opt("model", "claude-opus-5-5");
const ADMIN = process.env.ADMIN_TOKEN;
let seed = Number(opt("seed", Date.now() % 100000));
const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- who the early users are ----------
// locale weights ≈ where a Korean-born, English-default product gets its first traffic
const LOCALES = [["ko", 38], ["en", 34], ["ja", 8], ["zh", 7], ["es", 4], ["pt", 3], ["hi", 2], ["id", 2], ["fr", 1], ["de", 1]];
const NAMES = {
  ko: ["민준", "서연", "하은", "지우", "도윤", "예은", "준호", "수아", "시우", "지민", "하늘", "은우", "다은", "유진", "태양", "소율", "현우", "채원", "지호", "나윤"],
  en: ["Mina", "Sam", "Leo", "Ava", "Noah", "Maya", "Eli", "Zoe", "Jay", "Lena", "Owen", "Ruby", "Finn", "Isla", "Theo", "Nora", "Kai", "June", "Max", "Ivy"],
  ja: ["Yuki", "Haruto", "Sakura", "Ren", "Aoi", "Sora", "Hina", "Riku", "Mei", "Kaito"],
  zh: ["小雨", "子涵", "晨曦", "Wei", "Ling", "思远", "Yue", "Jia", "Hao", "Xin"],
  es: ["Lucía", "Mateo", "Sofía", "Diego", "Valentina", "Santi"],
  pt: ["Ana", "João", "Beatriz", "Rafa", "Lívia", "Caio"],
  hi: ["Arjun", "Priya", "Aarav", "Diya", "Rohan", "Isha"],
  id: ["Putri", "Rizky", "Dewi", "Aditya"],
  fr: ["Camille", "Louis", "Chloé", "Hugo"],
  de: ["Lena", "Jonas", "Mia", "Finn"],
};
const ANON_RATE = 0.4;
function persona() {
  let r = rnd() * LOCALES.reduce((a, [, w]) => a + w, 0), locale = "en";
  for (const [l, w] of LOCALES) { if ((r -= w) <= 0) { locale = l; break; } }
  const name = rnd() < ANON_RATE ? "" : pick(NAMES[locale]);
  const mood = pick(["hopeful", "tired but trying", "grateful", "worried about someone else", "quietly ambitious", "heartbroken but okay", "playful", "homesick", "nervous before something", "at peace"]);
  const topic = pick(["family health", "an exam or interview", "money and rent", "a relationship", "a pet", "a friend going through something", "work", "sleeping well", "a trip", "a small daily thing", "the whole world", "themselves, honestly", "a parent", "a child", "getting over someone", "a team or a game"]);
  return { locale, name, mood, topic };
}

// ---------- wishes: Claude, with a built-in fallback ----------
const BANK = {
  ko: ["엄마 수술 잘 되게 해주세요", "올해는 꼭 취업", "우리 강아지 오래오래", "시험 붙게 해주세요", "가족 모두 건강", "좋은 사람 만나기", "아빠 담배 끊기", "월세 안 밀리게", "잠 좀 잘 자고 싶다", "할머니 오래 사세요", "이번엔 진짜 끝까지", "동생 면접 잘 보길", "내년엔 우리 집", "그냥 다들 무사히", "마음이 좀 편해지길", "친구가 다시 웃었으면", "살 빼기 (진심)", "우리 팀 우승", "이직 성공", "용기 내기"],
  en: ["Let this be the year", "Mom's scan comes back clear", "Pass the bar exam", "Sleep through one whole night", "Come back to Rome with her", "Enough rent, no drama", "Dad stops smoking", "My dog gets to be old", "Say yes to the job", "Forgive him, finally", "A quiet year", "Visa approved please", "Get through Thursday", "Be braver than last year", "For my sister, you know why", "Finish the book", "Peace, honestly", "Find my people", "Make it to the finals", "Someone to come home to"],
  ja: ["合格しますように", "母が元気でいますように", "来年も一緒にいられますように", "ちゃんと眠れますように", "転職うまくいきますように", "猫が長生きしますように", "平安", "勇気が出ますように", "お金の心配が減りますように", "試合に勝てますように"],
  zh: ["爸爸早日康复", "想要一個家", "考研上岸", "平安", "狗狗长命百岁", "今年一定脱单", "妈妈别再那么累", "工作顺利", "早点睡", "家人平安"],
  es: ["Que mamá se recupere", "Un trabajo estable", "Volver a verla", "Paz para todos", "Aprobar el examen", "Que mi perro viva mucho"],
  pt: ["Saúde, amor, dinheiro", "Que ela diga sim", "Passar no concurso", "Axé", "Minha mãe bem", "Paz"],
  hi: ["Shanti for my family", "Clear the exam on the first try", "Papa's health", "A son who calls home", "Peace", "Good news this month"],
  id: ["Semoga ibu sehat", "Lulus ujian", "Rezeki lancar", "Damai"],
  fr: ["Que maman aille mieux", "Un peu de calme", "Réussir le concours", "Paix"],
  de: ["Gesundheit für Oma", "Endlich schlafen", "Den Job bekommen", "Frieden"],
};
const LANG = { ko: "Korean", en: "English", ja: "Japanese", zh: "Chinese", es: "Spanish", pt: "Portuguese", hi: "Hindi or Indian English", id: "Indonesian", fr: "French", de: "German" };

let client = null;
try { client = new Anthropic(); } catch {}

const SYSTEM = `You write the wishes people leave on a shared stone tower (a cairn) — the kind of thing someone types in two seconds on their phone before stacking a stone.

Rules:
- Each wish is 2 to 60 characters. Most are under 30. Many are fragments, not sentences.
- Write in the person's language, naturally, like a real person from that place would text. No translations, no romanization of CJK languages, no hashtags, no quotes, no emojis unless one in ten.
- Specific beats generic: a name of a pet, an exam, a city, "Thursday", "the second interview". Avoid the words "manifest", "universe", "abundance".
- Vary mood: hopeful, tired, funny, grieving, mundane. About one in five is about someone else. About one in ten is slightly funny or petty.
- Never include URLs, phone numbers, politics, hate, or sexual content.
- Output only a JSON array of strings, one per persona, in the same order. Nothing else.`;

async function generate(personas) {
  if (!client) return personas.map((p) => pick(BANK[p.locale]));
  const list = personas.map((p, i) => `${i + 1}. language=${LANG[p.locale]}, mood=${p.mood}, about=${p.topic}`).join("\n");
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Write one wish for each persona:\n${list}` }],
    });
    if (res.stop_reason === "refusal") throw new Error("refused");
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    if (!Array.isArray(arr) || arr.length !== personas.length) throw new Error("bad shape");
    return arr.map((w, i) => (typeof w === "string" && w.trim().length >= 2 ? w.trim().slice(0, 140) : pick(BANK[personas[i].locale])));
  } catch (e) {
    console.error("claude unavailable, using bank:", e.message);
    return personas.map((p) => pick(BANK[p.locale]));
  }
}

// ---------- traffic shape ----------
// hourly weight (UTC): evening peaks in Asia (10–15 UTC) and the Americas (0–5 UTC), a dip 18–21 UTC
const HOUR_W = [1.0, 1.1, 1.0, 0.8, 0.6, 0.5, 0.5, 0.6, 0.7, 0.9, 1.2, 1.4, 1.5, 1.4, 1.2, 1.0, 0.9, 0.8, 0.6, 0.5, 0.5, 0.6, 0.8, 0.9];
const weightAt = (ms) => HOUR_W[new Date(ms).getUTCHours()];

async function post(stone) {
  if (!ADMIN) throw new Error("ADMIN_TOKEN is required to write");
  const r = await fetch(`${URL_}/api/admin/stones`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": ADMIN }, body: JSON.stringify(stone) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

async function batch(n) {
  const personas = Array.from({ length: n }, persona);
  const wishes = await generate(personas);
  return personas.map((p, i) => ({ name: p.name, wish: wishes[i], locale: p.locale }));
}

if (mode === "preview") {
  const n = Number(opt("count", 20));
  for (const s of await batch(n)) console.log(`${s.locale.padEnd(3)} ${(s.name || "(anon)").padEnd(10)} ${s.wish}`);
} else if (mode === "backfill") {
  const count = Number(opt("count", 300)), days = Number(opt("days", 14));
  const now = Date.now(), from = now - days * 86_400_000;
  // sample timestamps by hourly weight, then sort so ids follow time
  const times = [];
  while (times.length < count) { const t = from + rnd() * (now - from - 120_000); if (rnd() * 1.5 < weightAt(t)) times.push(t); }
  times.sort((a, b) => a - b);
  let done = 0;
  for (let i = 0; i < count; i += 25) {
    const stones = await batch(Math.min(25, count - i));
    for (const [j, s] of stones.entries()) { await post({ name: s.name, wish: s.wish, createdAt: Math.round(times[i + j]) }); done++; }
    process.stdout.write(`\rbackfilled ${done}/${count}`);
  }
  console.log("\ndone");
} else if (mode === "live") {
  const perHour = Number(opt("per-hour", 6));
  console.log(`live seeding ≈${perHour}/h at ${URL_} (ctrl-c to stop)`);
  let queue = [];
  for (;;) {
    if (!queue.length) queue = await batch(10);
    const s = queue.shift();
    try { const r = await post({ name: s.name, wish: s.wish }); console.log(new Date().toISOString(), `#${r.stone.id}`, s.locale, s.name || "(anon)", "·", s.wish); }
    catch (e) { console.error("post failed:", e.message); }
    const meanMs = 3_600_000 / (perHour * weightAt(Date.now()));
    await sleep(Math.max(20_000, -Math.log(1 - rnd()) * meanMs)); // poisson-ish gaps
  }
} else {
  console.error("usage: seed-users.mjs preview|backfill|live [--count N] [--days D] [--per-hour H] [--url U] [--model M]");
  process.exit(1);
}
