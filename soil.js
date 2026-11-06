// The garden's rules, shared by the server (simulation, validation) and the page (rendering, previews). No DOM, no deps.
// Every number that matters comes from agri.js: real soil profiles (SoilGrids), real species traits (USDA PLANTS)
// and real climate normals (KMA). The ground patches themselves are unchanged; each one now carries a real profile.
//
// Time: one real day is one garden WEEK (GARDEN_DAYS_PER_DAY), so a year of seasons passes in 52 real days and a
// summer annual blooms in about a week of daily care. The weather is deterministic per day (same for everyone).
import { SOIL_PROFILES, SPECIES, CLIMATE, textureClass } from "./agri.js";
export { SOIL_PROFILES, SPECIES, CLIMATE };

export const RADIUS_MIN = 3.6, RADIUS_MAX = 12, MIN_GAP = 0.9; // where you may plant (world units around the tower base)
export const GARDEN_DAYS_PER_DAY = 7;
export const MULCH_DAYS = 5;                                   // real days a mulch lasts
export const STAGES = [0, 0.001, 1, 2.5, 5, 9];                // growth units for stage 0..5: seed · sprout · seedling · sapling · young plant · in bloom
export const SOILS = Object.fromEntries(Object.keys(SOIL_PROFILES).map((k) => [k, { ...SOIL_PROFILES[k], texture: textureClass(SOIL_PROFILES[k]) }]));
export const SEEDS = SPECIES;
export const unlockedSeeds = (karma) => Object.keys(SPECIES).filter((k) => karma >= SPECIES[k].karma);

// ---------- ground patches (unchanged) ----------
const h2 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = h2(ix, iz), b = h2(ix + 1, iz), c = h2(ix, iz + 1), d = h2(ix + 1, iz + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
export function soilAt(x, z) {
  const n = vnoise(x * 0.23 + 3.1, z * 0.23 + 7.7) * 0.7 + vnoise(x * 0.6, z * 0.6) * 0.3;
  const ang = Math.atan2(z, x), r = Math.hypot(x, z);
  const riverR = 7.4 + Math.sin(ang * 2.3 + 0.8) * 1.6 + Math.sin(ang * 5.1) * 0.5;
  if (Math.abs(r - riverR) < 0.75) return "river";
  if (n < 0.36) return "rocky";
  if (n > 0.66) return "moss";
  return "meadow";
}
export const inGarden = (x, z) => { const r = Math.hypot(x, z); return r >= RADIUS_MIN && r <= RADIUS_MAX; };

// ---------- weather: deterministic daily weather from the climate normals ----------
const gaussish = (seed) => (h2(seed, 1.3) + h2(seed, 7.9) + h2(seed, 3.7) - 1.5) * 2; // ≈ N(0, 1)
/** Day of the garden year (0..364) for a real day index. */
export const gardenDoy = (day) => ((day * GARDEN_DAYS_PER_DAY) % 365 + 365) % 365;
function normal(arr, doy) { const m = doy / 365 * 12 - 0.5; const i = Math.floor((m + 12) % 12), j = (i + 1) % 12, t = m - Math.floor(m); return arr[i] * (1 - t) + arr[j] * t; }
/** Weather on a real day: temperatures (°C), rain (mm), condition. Same for everyone, no history needed. */
export function weatherOn(day) {
  const doy = gardenDoy(day), m = Math.floor(doy / 365 * 12);
  const tmean = normal(CLIMATE.tmean, doy) + vnoise(day * 0.37, 2.5) * 7 - 3.5 + gaussish(day) * 1.2;
  const tmin = tmean - CLIMATE.diurnal / 2 - Math.abs(gaussish(day + 0.5)) * 1.5, tmax = tmean + CLIMATE.diurnal / 2;
  const pRain = CLIMATE.raindays[m] / 30, raining = h2(day, 11.1) < pRain;
  const rain = raining ? Math.round(CLIMATE.precip[m] / CLIMATE.raindays[m] * (0.4 + h2(day, 5.5) * 1.6) * 10) / 10 : 0;
  let dry = 0; for (let d = 1; d <= 10 && h2(day - d, 11.1) >= CLIMATE.raindays[Math.floor(gardenDoy(day - d) / 365 * 12)] / 30; d++) dry++;
  const cond = rain && tmax < 2 ? "snow" : rain ? "rain" : tmin < -1 ? "frost" : tmax >= 33 ? "heat" : dry >= 6 ? "dry" : h2(day, 9.2) < 0.4 ? "cloudy" : "clear";
  return { day, doy, month: m, tmean: +tmean.toFixed(1), tmin: +tmin.toFixed(1), tmax: +tmax.toFixed(1), rain, cond, dryStreak: dry };
}

// ---------- the plant: a day-by-day simulation from planting to today ----------
const DROUGHT_THR = { None: 0.35, Low: 0.28, Medium: 0.2, High: 0.12 };
const MOISTURE_USE = { Low: 0.7, Medium: 1, High: 1.4 };
const GROWTH_RATE = { Slow: 0.7, Moderate: 1, Rapid: 1.3 };
const ANAEROBIC = { None: 6, Low: 3, Medium: 1, High: 0 };
const BLOOM_MONTHS = { "Summer": [5, 6, 7], "Mid Summer": [6, 7], "Late Spring": [4, 5], "Fall": [8, 9, 10], "Spring": [2, 3, 4], "Mid Spring": [3, 4] };
/**
 * plant = { plantedDay, kind, soil, waters: [day…], mulches: [day…] } (real day indexes); weatherFn for tests.
 * Returns the state at `today` plus the stresses of the last day and what tomorrow brings.
 */
export function simulate(plant, today, weatherFn = weatherOn) {
  const sp = SPECIES[plant.kind] ?? SPECIES.wildflower, S = SOILS[plant.soil] ?? SOILS.meadow;
  const phOk = S.ph >= sp.ph[0] && S.ph <= sp.ph[1], texOk = sp.texture.includes(S.texture);
  const waters = new Set(plant.waters ?? []), mulches = plant.mulches ?? [];
  const st = { moisture: 0.6, health: 100, growth: 0, germinated: false, alive: true, coldDays: 0, droughtDays: 0, stage: 0, stress: [], diedOn: null, cause: null };
  const thr = DROUGHT_THR[sp.drought] ?? 0.2;
  for (let d = plant.plantedDay; d <= today; d++) {
    const w = weatherFn(d), mulched = mulches.some((m) => d >= m && d < m + MULCH_DAYS), stress = [];
    // water balance (1.0 = field capacity)
    st.moisture += w.rain / 40;
    let et = (0.02 + 0.004 * Math.max(0, w.tmean)) * (MOISTURE_USE[sp.moisture] ?? 1) * (S.shallow ? 1.3 : 1) * (mulched ? 0.5 : 1) * GARDEN_DAYS_PER_DAY / 7 * 1.6;
    st.moisture -= et;
    if (waters.has(d)) st.moisture = 1.0;
    if (S.wet) st.moisture = Math.max(st.moisture, 0.45);
    st.moisture = Math.min(1.25, Math.max(0, st.moisture));
    if (w.tmin < 5) st.coldDays++;
    if (!st.alive) continue;
    // germination: cold-stratified seeds wait for winter; everyone waits for moist, mild ground
    if (!st.germinated) {
      if (sp.strat && st.coldDays < 2) { stress.push("strat"); }
      else if (st.moisture >= 0.3 && w.tmean >= 8) { st.germinated = true; st.growth = STAGES[1]; }
      else stress.push(w.tmean < 8 ? "cold" : "dry");
      st.stress = stress; continue;
    }
    // stresses
    let hit = 0;
    if (st.moisture < thr) { st.droughtDays++; hit += Math.min(34, (w.cond === "heat" ? 16 : 10) + 4 * (st.droughtDays - 1)) * (st.stage <= 1 ? 1.5 : 1); stress.push("drought"); } else st.droughtDays = 0; // a dry spell gets worse every day it lasts
    if (st.moisture > 1.1 && (ANAEROBIC[sp.anaerobic] ?? 6) > 0) { hit += (ANAEROBIC[sp.anaerobic] ?? 6) * 0.7; stress.push("waterlogged"); }
    if (w.tmin < -2 && st.stage <= 2) { hit += mulched ? 4 : 25; stress.push(mulched ? "frostMulched" : "frost"); }
    if (w.tmin < sp.tminC) { hit += 100; stress.push("killingFrost"); }
    if (w.tmax >= 33 && st.moisture < 0.5) { hit += 8; stress.push("heat"); }
    if (!phOk) { hit += 2; stress.push("ph"); }
    if (!texOk) stress.push("texture");
    st.health = Math.max(0, st.health - hit);
    if (hit === 0) st.health = Math.min(100, st.health + 4);
    if (st.health <= 0) { st.alive = false; st.diedOn = d; st.cause = stress.find((s) => s !== "ph" && s !== "texture") ?? "neglect"; st.stress = stress; continue; }
    // growth: growing-degree days above 5 °C, scaled by species rate, soil fit, water and health
    const gdd = Math.max(0, w.tmean - 5) * GARDEN_DAYS_PER_DAY;
    if (gdd > 0 && st.health > 30) {
      const waterOk = st.moisture >= thr && st.moisture <= 1.05;
      st.growth += gdd / 100 * (GROWTH_RATE[sp.growth] ?? 1) * (phOk ? 1 : 0.6) * (texOk ? 1 : 0.7) * (waterOk ? 1 : 0.4) * (st.health / 100);
    } else if (gdd === 0) stress.push("dormant");
    let stage = STAGES.filter((k) => st.growth >= k).length - 1;
    if (stage === 5) { const months = BLOOM_MONTHS[sp.bloom] ?? [5, 6, 7]; if (sp.needsWet && !S.wet) { stage = 4; stress.push("needsWet"); } else if (!months.includes(w.month)) { stage = 4; stress.push("season"); } }
    st.stage = stage; st.stress = stress;
  }
  const w = weatherFn(today), next = weatherFn(today + 1);
  const mulchedNow = mulches.some((m) => today >= m && today < m + MULCH_DAYS);
  const warnings = [];
  if (st.alive && st.germinated) {
    if (next.tmin < -2 && st.stage <= 2 && !mulchedNow) warnings.push("frostTomorrow");
    if (st.moisture < thr + 0.1 && !waters.has(today)) warnings.push("thirsty");
    if (next.cond === "heat") warnings.push("heatTomorrow");
    if (!phOk) warnings.push("ph"); if (!texOk) warnings.push("texture");
    if (sp.needsWet && !S.wet) warnings.push("needsWet");
  }
  return { ...st, moisture: +st.moisture.toFixed(2), growth: +st.growth.toFixed(2), weather: w, tomorrow: next, mulched: mulchedNow, warnings, phOk, texOk, thr,
    next: STAGES[st.stage + 1] ? +(STAGES[st.stage + 1] - st.growth).toFixed(2) : null };
}
