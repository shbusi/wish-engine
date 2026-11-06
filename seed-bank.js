// Virtual early users: where they come from, what they are called, what they wish for, and when they come.
// Shared by tools/seed-users.mjs (backfill, Claude-written wishes) and the server's own live seeder (SEED_PER_HOUR).
// No dependencies.
export const LOCALES = [["ko", 38], ["en", 34], ["ja", 8], ["zh", 7], ["es", 4], ["pt", 3], ["hi", 2], ["id", 2], ["fr", 1], ["de", 1]];
export const NAMES = {
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
export const BANK = {
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
export const ANON_RATE = 0.4;
// hourly weight (UTC): evening peaks in Asia (10–15 UTC) and the Americas (0–5 UTC), a dip 18–21 UTC
export const HOUR_W = [1.0, 1.1, 1.0, 0.8, 0.6, 0.5, 0.5, 0.6, 0.7, 0.9, 1.2, 1.4, 1.5, 1.4, 1.2, 1.0, 0.9, 0.8, 0.6, 0.5, 0.5, 0.6, 0.8, 0.9];
export const weightAt = (ms) => HOUR_W[new Date(ms).getUTCHours()];
const pickWith = (rnd) => (a) => a[Math.floor(rnd() * a.length)];
/** A random visitor: locale by weight, a name (or none), and a wish from the bank. `rnd` is any 0..1 generator. */
export function visitor(rnd = Math.random) {
  const pick = pickWith(rnd);
  let r = rnd() * LOCALES.reduce((a, [, w]) => a + w, 0), locale = "en";
  for (const [l, w] of LOCALES) { if ((r -= w) <= 0) { locale = l; break; } }
  return { locale, name: rnd() < ANON_RATE ? "" : pick(NAMES[locale]), wish: pick(BANK[locale]) };
}
/** Milliseconds until the next seeded stone: exponential around the hourly rate, scaled by the time-of-day curve. */
export function nextDelay(perHour, now = Date.now(), rnd = Math.random) {
  const rate = Math.max(0.01, perHour) * weightAt(now) / 1.0; // stones per hour right now
  const u = Math.max(1e-6, 1 - rnd());
  return Math.min(3 * 3_600_000, Math.max(20_000, -Math.log(u) / rate * 3_600_000));
}
