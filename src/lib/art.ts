/**
 * Art manifest: the seam where generated 2D/3D assets plug into the app.
 * When an entry exists it replaces the built-in SVG/CSS rendering for that
 * channel; when it doesn't, nothing changes. See docs/ART_DIRECTION.md.
 */
import manifest from "../../public/art/manifest.json";
import type { Rarity } from "./relics";

interface ChannelArt {
  background?: string;
  backgroundLoop?: string;
  objects?: Partial<Record<Rarity, string>>;
  model?: string;
}

const channels = (manifest as { channels: Record<string, ChannelArt> }).channels ?? {};

export function channelArt(channelId: string): ChannelArt | undefined {
  return channels[channelId];
}

/** Sprite for the ritual object at a rarity, falling back down the tiers. */
export function objectSprite(channelId: string, rarity: Rarity): string | undefined {
  const o = channels[channelId]?.objects;
  if (!o) return undefined;
  const order: Rarity[] = ["LEGENDARY", "RARE", "UNCOMMON", "COMMON"];
  for (const r of order.slice(order.indexOf(rarity))) if (o[r]) return o[r];
  return undefined;
}
