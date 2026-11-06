// Real-world basis for the garden. No DOM, no deps; used by soil.js (rules), server.js and the page.
//
// SOIL PROFILES — ISRIC SoilGrids v2.0 (rest.isric.org), 0–5 cm, mean values at a real reference point for each of
// the four ground patches. Units: pH (H2O), clay/sand %, soc = organic carbon g/kg, fc = water at field capacity
// (vol %), WRB = World Reference Base class (FAO/ISRIC). Fetched 2026-11-06.
export const SOIL_PROFILES = {
  meadow: { ref: "Korean uplands, Chungcheong (127.5E 36.5N)", wrb: "Cambisols", ph: 6.0, clay: 27.5, sand: 37.6, soc: 56,  fc: 33 },
  river:  { ref: "Seoraksan valley floor (128.1E 37.9N)",        wrb: "Cambisols / Fluvisols", ph: 5.5, clay: 25.8, sand: 38.2, soc: 68, fc: 41, wet: true },
  rocky:  { ref: "Alpine valley slope (9.6E 46.4N)",              wrb: "Cambisols / Leptosols", ph: 5.7, clay: 19.0, sand: 46.8, soc: 82, fc: 32, shallow: true },
  moss:   { ref: "Hallasan volcanic slope, Jeju (126.53E 33.36N)", wrb: "Andosols", ph: 5.4, clay: 25.7, sand: 37.0, soc: 100, fc: 38 },
};
/** USDA soil texture class from clay/sand (coarse = sandy, fine = clayey, else medium). */
export const textureClass = ({ clay, sand }) => (sand >= 50 ? "coarse" : clay >= 35 ? "fine" : "medium");

// SPECIES — USDA PLANTS Database characteristics (plants.usda.gov, PlantCharacteristics API), fetched 2026-11-06.
// ph = tolerated range, texture = adapted soil classes, drought/moisture/shade = USDA categories,
// tminC = minimum temperature the plant survives (converted from °F), frostFreeDays = minimum growing season,
// strat = cold stratification required before germination, growth = USDA growth rate, bloom = USDA bloom period.
export const SPECIES = {
  wildflower: { usda: "RUHI2", name: "Rudbeckia hirta",   common: "black-eyed Susan",    ph: [6.0, 7.0], texture: ["medium", "fine"],          drought: "Medium", moisture: "Medium", anaerobic: "None", shade: "High",   tminC: -31, frostFreeDays: 165, strat: false, growth: "Rapid",    bloom: "Summer",      karma: 0 },
  pine:       { usda: "PIST",  name: "Pinus strobus",     common: "eastern white pine",  ph: [4.0, 6.5], texture: ["medium"],                  drought: "None",   moisture: "Medium", anaerobic: "None", shade: "Medium", tminC: -36, frostFreeDays: 90,  strat: true,  growth: "Rapid",    bloom: "Late Spring", karma: 3 },
  lotus:      { usda: "NELU",  name: "Nelumbo lutea",     common: "American lotus",      ph: [4.6, 8.7], texture: ["coarse", "medium", "fine"], drought: "None",   moisture: "High",   anaerobic: "High", shade: "High",   tminC: -38, frostFreeDays: 130, strat: false, growth: "Moderate", bloom: "Mid Summer",  karma: 10, needsWet: true },
  lantern:    { usda: "HAVI4", name: "Hamamelis virginiana", common: "witch-hazel",      ph: [4.5, 6.2], texture: ["medium", "fine"],          drought: "Low",    moisture: "Medium", anaerobic: "Low",  shade: "Medium", tminC: -33, frostFreeDays: 120, strat: true,  growth: "Slow",     bloom: "Fall",        karma: 50 },
};

// CLIMATE — monthly normals for the garden's reference climate (central Korean uplands, KMA 1991–2020 normals,
// Daejeon station, rounded): mean temperature °C, precipitation mm, days with ≥0.1 mm. Used by the deterministic
// weather simulation until a live weather provider is configured (WEATHER_PROVIDER=open-meteo needs api.open-meteo.com).
export const CLIMATE = {
  ref: "Daejeon, KMA 1991–2020 normals",
  tmean: [-1.0, 1.5, 6.8, 13.0, 18.6, 23.0, 25.9, 26.5, 21.6, 14.9, 7.8, 1.3],
  precip: [30, 36, 50, 85, 95, 140, 300, 280, 150, 50, 45, 25],
  raindays: [7, 6, 8, 8, 9, 10, 15, 14, 9, 6, 8, 7],
  diurnal: 10, // typical day/night range °C
};

export const SOURCES = [
  { name: "ISRIC SoilGrids v2.0", url: "https://rest.isric.org/soilgrids/v2.0/docs" },
  { name: "FAO/ISRIC World Reference Base for Soil Resources", url: "https://www.fao.org/soils-portal/" },
  { name: "USDA PLANTS Database — Characteristics", url: "https://plants.usda.gov/" },
  { name: "Korea Meteorological Administration climate normals (1991–2020)", url: "https://data.kma.go.kr/" },
];
