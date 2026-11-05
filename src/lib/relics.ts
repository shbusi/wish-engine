/**
 * Rare drops. When a wish is offered, a rarity is rolled. Anything above
 * COMMON mints a Relic: a culturally specific variant of the ritual object
 * (a jade stone, a gilded ema, an ancient coin) that the finder owns and can
 * put up for auction.
 */
import { randomInt } from "node:crypto";
import type { Locale } from "./channels";

export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "LEGENDARY";
export const RARE_TIERS: Exclude<Rarity, "COMMON">[] = ["UNCOMMON", "RARE", "LEGENDARY"];

/** Odds in basis points of 10,000. Override per env for events. */
export function rarityOdds() {
  return {
    LEGENDARY: Number(process.env.RARITY_LEGENDARY_BP ?? 10), // 0.1%
    RARE: Number(process.env.RARITY_RARE_BP ?? 90), // 0.9%
    UNCOMMON: Number(process.env.RARITY_UNCOMMON_BP ?? 500), // 5%
  };
}

export function rollRarity(rng: () => number = () => randomInt(0, 10_000)): Rarity {
  // Test hook: only outside production, or on staging (same flag that enables mock payments).
  const forced = process.env.RARITY_FORCE;
  const testing = process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCK_PAYMENTS === "1";
  if (forced && testing && (RARE_TIERS as string[]).includes(forced)) return forced as Rarity;
  const o = rarityOdds();
  const x = rng();
  if (x < o.LEGENDARY) return "LEGENDARY";
  if (x < o.LEGENDARY + o.RARE) return "RARE";
  if (x < o.LEGENDARY + o.RARE + o.UNCOMMON) return "UNCOMMON";
  return "COMMON";
}

export const RARITY_STYLE: Record<Rarity, { color: string; glow: string; label: Record<Locale, string> }> = {
  COMMON: { color: "#a39d90", glow: "transparent", label: { ko: "일반", en: "Common", ja: "通常", zh: "普通" } },
  UNCOMMON: { color: "#5ad18f", glow: "rgba(90,209,143,.5)", label: { ko: "희귀", en: "Uncommon", ja: "レア", zh: "稀有" } },
  RARE: { color: "#f0b35b", glow: "rgba(240,179,91,.6)", label: { ko: "영물", en: "Rare", ja: "霊物", zh: "灵物" } },
  LEGENDARY: { color: "#c084fc", glow: "rgba(192,132,252,.7)", label: { ko: "전설", en: "Legendary", ja: "伝説", zh: "传说" } },
};

/** Minimum opening bid in credits (1 credit = ₩100). */
export const MIN_BID_BY_RARITY: Record<Exclude<Rarity, "COMMON">, number> = { UNCOMMON: 5, RARE: 20, LEGENDARY: 100 };

type Names = Record<Locale, string>;
const V = (ko: string, en: string, ja: string, zh: string): Names => ({ ko, en, ja, zh });

/** Per-channel relic variants, by rarity. */
export const RELIC_VARIANTS: Record<string, Record<Exclude<Rarity, "COMMON">, Names>> = {
  "stone-cairn": {
    UNCOMMON: V("이끼 낀 돌", "Mossy Stone", "苔むした石", "苔石"),
    RARE: V("옥돌", "Jade Stone", "翡翠の石", "玉石"),
    LEGENDARY: V("운석 조각", "Meteorite Shard", "隕石のかけら", "陨石碎片"),
  },
  ema: {
    UNCOMMON: V("벚꽃 에마", "Sakura Ema", "桜の絵馬", "樱花绘马"),
    RARE: V("금박 에마", "Gilded Ema", "金箔の絵馬", "金箔绘马"),
    LEGENDARY: V("천년 신목 에마", "Sacred Cedar Ema", "千年神木の絵馬", "千年神木绘马"),
  },
  "wishing-fountain": {
    UNCOMMON: V("은화", "Silver Coin", "銀貨", "银币"),
    RARE: V("금화", "Gold Coin", "金貨", "金币"),
    LEGENDARY: V("고대 로마 동전", "Ancient Roman Coin", "古代ローマのコイン", "古罗马硬币"),
  },
  "sky-lantern": {
    UNCOMMON: V("붉은 풍등", "Crimson Lantern", "紅い天燈", "红天灯"),
    RARE: V("용 풍등", "Dragon Lantern", "龍の天燈", "龙天灯"),
    LEGENDARY: V("달빛 풍등", "Moonlit Lantern", "月光の天燈", "月光天灯"),
  },
  "ribbon-tree": {
    UNCOMMON: V("비단 리본", "Silk Ribbon", "絹のリボン", "丝绸红布"),
    RARE: V("금실 리본", "Gold-thread Ribbon", "金糸のリボン", "金线红布"),
    LEGENDARY: V("천년수 리본", "Ancient Tree Ribbon", "千年樹のリボン", "千年树红布"),
  },
  "prayer-wall": {
    UNCOMMON: V("양피지 쪽지", "Parchment Note", "羊皮紙の紙片", "羊皮纸条"),
    RARE: V("봉인된 쪽지", "Sealed Note", "封印された紙片", "封印纸条"),
    LEGENDARY: V("왕의 쪽지", "King's Note", "王の紙片", "王之纸条"),
  },
  "votive-candle": {
    UNCOMMON: V("밀랍초", "Beeswax Candle", "蜜蝋のろうそく", "蜂蜡烛"),
    RARE: V("황금 촛대", "Golden Candlestick", "黄金の燭台", "黄金烛台"),
    LEGENDARY: V("꺼지지 않는 불", "Eternal Flame", "消えない炎", "不灭之火"),
  },
  krathong: {
    UNCOMMON: V("연꽃 끄라통", "Lotus Krathong", "蓮のクラトン", "莲花水灯"),
    RARE: V("황금 끄라통", "Golden Krathong", "黄金のクラトン", "黄金水灯"),
    LEGENDARY: V("달빛 끄라통", "Moonlit Krathong", "月光のクラトン", "月光水灯"),
  },
  "bonfim-ribbon": {
    UNCOMMON: V("삼색 리본", "Tricolor Ribbon", "三色のリボン", "三色彩带"),
    RARE: V("금실 리본", "Gold-thread Ribbon", "金糸のリボン", "金线彩带"),
    LEGENDARY: V("축복받은 리본", "Blessed Ribbon", "祝福されたリボン", "受祝福的彩带"),
  },
  "prayer-flag": {
    UNCOMMON: V("비단 깃발", "Silk Flag", "絹の旗", "丝绸经幡"),
    RARE: V("금문 깃발", "Gold-script Flag", "金文字の旗", "金文经幡"),
    LEGENDARY: V("설산의 깃발", "Flag of the Snow Peak", "雪山の旗", "雪山经幡"),
  },
  diya: {
    UNCOMMON: V("은 디야", "Silver Diya", "銀のディヤ", "银河灯"),
    RARE: V("금 디야", "Golden Diya", "金のディヤ", "金河灯"),
    LEGENDARY: V("갠지스의 첫 등불", "First Lamp of the Ganges", "ガンジスの最初の灯", "恒河第一盏灯"),
  },
  "shooting-star": {
    UNCOMMON: V("유성", "Meteor", "流星", "流星"),
    RARE: V("쌍성", "Binary Star", "連星", "双星"),
    LEGENDARY: V("초신성", "Supernova", "超新星", "超新星"),
  },
};

export function relicName(channelId: string, rarity: Rarity, locale: Locale): string {
  if (rarity === "COMMON") return "";
  return RELIC_VARIANTS[channelId]?.[rarity]?.[locale] ?? `${rarity} relic`;
}

export function variantId(channelId: string, rarity: Rarity) {
  return `${channelId}:${rarity}`;
}
