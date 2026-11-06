// The garden's rules, shared by the server (growth, validation) and the page (rendering, previews). No DOM, no deps.
//
// Soil patches lie around the foot of the tower; where you plant decides how fast your plant grows, how quickly it
// wilts when you stay away, and whether a given seed can bloom there. Seeds unlock with karma.

export const RADIUS_MIN = 3.6, RADIUS_MAX = 12, MIN_GAP = 0.9; // where you may plant (world units around the tower base)

export const SOILS = {
  meadow: { speed: 1,   wilt: 3,        hue: 0.27 }, // balanced
  river:  { speed: 1.4, wilt: 2,        hue: 0.52 }, // grows fast, thirsts fast
  rocky:  { speed: 0.7, wilt: Infinity, hue: 0.08 }, // slow, never wilts
  moss:   { speed: 1,   wilt: 4,        hue: 0.4 },  // patient; where strange things bloom
};
export const SEEDS = {
  wildflower: { karma: 0,  bloomsOn: ["meadow", "river", "moss", "rocky"] },
  pine:       { karma: 3,  bloomsOn: ["meadow", "rocky", "moss"], evergreen: true },   // no flowers, but tall, and happy on rock
  lotus:      { karma: 10, bloomsOn: ["river", "moss"] },                              // needs wet ground to open
  lantern:    { karma: 50, bloomsOn: ["moss", "rocky"], glow: true },                   // blooms as lights in the dark
};
export const STAGES = [0, 1, 2, 3, 5, 7]; // growth needed for stage 0..5: seed · sprout · seedling · sapling · young tree · in bloom

// deterministic value noise so both sides agree on the soil at any point
const h2 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = h2(ix, iz), b = h2(ix + 1, iz), c = h2(ix, iz + 1), d = h2(ix + 1, iz + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
/** Soil at a point: patches a few units wide, with a river band winding around the base. */
export function soilAt(x, z) {
  const n = vnoise(x * 0.23 + 3.1, z * 0.23 + 7.7) * 0.7 + vnoise(x * 0.6, z * 0.6) * 0.3;
  const ang = Math.atan2(z, x), r = Math.hypot(x, z);
  const riverR = 7.4 + Math.sin(ang * 2.3 + 0.8) * 1.6 + Math.sin(ang * 5.1) * 0.5;   // a ring-shaped brook that wanders
  if (Math.abs(r - riverR) < 0.75) return "river";
  if (n < 0.36) return "rocky";
  if (n > 0.66) return "moss";
  return "meadow";
}
export const inGarden = (x, z) => { const r = Math.hypot(x, z); return r >= RADIUS_MIN && r <= RADIUS_MAX; };

/** Waterings that still count after wilting: one is lost per `wilt` missed days; never below the first. */
export function keptWaterings({ waterings, lastDay, soil }, today) {
  const S = SOILS[soil] ?? SOILS.meadow, missed = Math.max(0, today - lastDay - 1);
  const wilt = S.wilt === Infinity ? 0 : Math.floor(missed / S.wilt);
  return Math.max(1, waterings - wilt);
}
/** Effective growth: kept waterings × soil speed. */
export const growthOf = (row, today) => keptWaterings(row, today) * (SOILS[row.soil] ?? SOILS.meadow).speed;
export function stageOf(growth, kind, soil) {
  let st = STAGES.filter((k) => growth >= k).length - 1;
  const seed = SEEDS[kind] ?? SEEDS.wildflower;
  if (st === 5 && !seed.bloomsOn.includes(soil)) st = 4; // wrong ground: it grows but never opens
  return st;
}
export const unlockedSeeds = (karma) => Object.keys(SEEDS).filter((k) => karma >= SEEDS[k].karma);
