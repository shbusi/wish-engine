/**
 * Shareable wish card, rendered by Satori (next/og). Everything here must be
 * Satori-safe: flex divs, inline styles, no CSS classes, no SVG text.
 *
 * The visitor's name is "inscribed" on the ritual object of their channel:
 * a stone, a plaque, a coin, a lantern, a ribbon...
 */
import React from "react";
import type { ChannelDef, ChannelVisual, Locale } from "./channels";
import { RARITY_STYLE, type Rarity } from "./relics";

export type CardFormat = "story" | "og" | "square";
export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 }, // TikTok / Reels / Shorts / Stories
  og: { width: 1200, height: 630 }, // link previews on X, Slack, KakaoTalk
  square: { width: 1080, height: 1080 }, // Instagram feed / X image
};

export const CARD_COPY: Record<Locale, { by: string; cta: string; joined: (n: number) => string }> = {
  ko: { by: "", cta: "당신의 소원도 올려보세요", joined: (n) => `${n}명이 이어서 소원을 빌었어요` },
  en: { by: "by", cta: "Add your own wish", joined: (n) => `${n} people wished after this` },
  ja: { by: "", cta: "あなたの願いも", joined: (n) => `${n}人がこの願いに続きました` },
  zh: { by: "", cta: "也许下你的愿望", joined: (n) => `${n}人接着许了愿` },
};

export interface CardInput {
  channel: ChannelDef;
  locale: Locale;
  text: string;
  author: string | null;
  referrals: number;
  count: number;
  url: string;
  format: CardFormat;
  fontFamily: string;
  rarity?: Rarity;
  relicName?: string;
}

/** Satori chokes on `undefined` style values; strip them. */
const S = (o: React.CSSProperties): React.CSSProperties =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as React.CSSProperties;

/** The ritual object with the wisher's name on it. */
/**
 * `glow=false` drops blur shadows and `flat=true` replaces gradients with solid
 * fills; both exist because blur and gradient masks are what make resvg slow
 * when rendering video frames.
 */
export function Token({ visual, name, hue, size, glow: glowOn = true, flat = false }: { visual: ChannelVisual; name: string; hue: number; size: number; glow?: boolean; flat?: boolean }) {
  const label = S({
    display: "flex",
    color: "#1a1208",
    fontWeight: 700,
    fontSize: size * 0.11,
    textAlign: "center",
    lineHeight: 1.1,
    maxWidth: size * 0.8,
    overflow: "hidden",
  });
  const flex = S({ display: "flex", alignItems: "center", justifyContent: "center" });
  const glow = glowOn ? `0 0 ${size * 0.25}px hsl(${hue} 80% 60% / 0.55)` : "none";

  switch (visual) {
    case "cairn":
      return (
        <div style={{ ...flex, flexDirection: "column", width: size, height: size }}>
          <div style={{ ...flex, width: size * 0.55, height: size * 0.2, borderRadius: "50%", background: "#9a8b7a", border: `4px solid #4a3f33`, boxShadow: glow }}>
            <span style={label}>{name}</span>
          </div>
          <div style={{ width: size * 0.7, height: size * 0.2, borderRadius: "50%", background: "#7a6d5e", border: `4px solid #4a3f33`, marginTop: -6 }} />
          <div style={{ width: size * 0.85, height: size * 0.22, borderRadius: "50%", background: "#8b7d6b", border: `4px solid #4a3f33`, marginTop: -8 }} />
        </div>
      );
    case "ema":
      return (
        <div style={{ ...flex, flexDirection: "column", width: size, height: size }}>
          <div style={{ display: "flex", width: size * 0.8, height: size * 0.2, overflow: "hidden", alignItems: "flex-end", justifyContent: "center" }}>
            <div style={{ width: size * 0.56, height: size * 0.56, background: "#b08a55", transform: "rotate(45deg) translateY(28%)", borderRadius: 6 }} />
          </div>
          <div style={{ ...flex, flexDirection: "column", width: size * 0.8, height: size * 0.55, background: "#c9a06a", borderLeft: "5px solid #7a5a3a", borderRight: "5px solid #7a5a3a", borderBottom: "5px solid #7a5a3a", boxShadow: glow }}>
            <span style={{ ...label, fontSize: size * 0.13 }}>{name}</span>
          </div>
        </div>
      );
    case "fountain":
      return (
        <div style={{ ...flex, width: size, height: size }}>
          <div style={{ ...flex, width: size * 0.78, height: size * 0.78, borderRadius: "50%", background: flat ? "#edc55f" : "linear-gradient(135deg,#ffe29a,#d9a441)", border: `8px solid #b8862b`, boxShadow: glow }}>
            <span style={{ ...label, color: "#5a3d0a" }}>{name}</span>
          </div>
        </div>
      );
    case "lantern":
      return (
        <div style={{ ...flex, flexDirection: "column", width: size, height: size }}>
          <div style={{ ...flex, width: size * 0.6, height: size * 0.72, borderRadius: size * 0.08, background: flat ? "#ff9640" : "linear-gradient(180deg,#ffb060,#ff7a1f)", boxShadow: glowOn ? `0 0 ${size * 0.35}px rgba(255,160,60,.7)` : "none" }}>
            <span style={{ ...label, color: "#5a2a00" }}>{name}</span>
          </div>
          <div style={{ width: size * 0.2, height: size * 0.06, background: "#ffd27f", marginTop: 4 }} />
        </div>
      );
    case "ribbon-tree":
    case "bonfim":
    case "prayer-flag": {
      const bg = visual === "prayer-flag" ? `hsl(${hue} 70% 50%)` : visual === "bonfim" ? "#2b9348" : `hsl(${hue} 80% 55%)`;
      return (
        <div style={{ ...flex, width: size, height: size }}>
          <div style={{ ...flex, flexDirection: "column", justifyContent: "space-around", width: size * 0.3, height: size * 0.95, background: bg, borderRadius: 6, boxShadow: glow, transform: "rotate(-6deg)" }}>
            <span style={{ ...label, color: "#fff", fontSize: size * 0.1, transform: "rotate(90deg)", width: size * 0.8 }}>{name}</span>
          </div>
        </div>
      );
    }
    case "wall":
      return (
        <div style={{ ...flex, width: size, height: size }}>
          <div style={{ ...flex, width: size * 0.7, height: size * 0.45, background: "#fdf6e3", border: "3px solid #bfae8c", transform: "rotate(-8deg)", boxShadow: glowOn ? "0 10px 30px rgba(0,0,0,.4)" : "none" }}>
            <span style={{ ...label, color: "#6b5a3a", fontSize: size * 0.09 }}>{name}</span>
          </div>
        </div>
      );
    case "candle":
    case "diya":
    case "krathong":
      return (
        <div style={{ ...flex, flexDirection: "column", width: size, height: size }}>
          <div style={{ width: size * 0.1, height: size * 0.2, borderRadius: "50%", background: "#ffcf5c", boxShadow: glowOn ? `0 0 ${size * 0.3}px rgba(255,200,90,.8)` : "none" }} />
          <div
            style={{
              ...flex,
              width: visual === "candle" ? size * 0.3 : size * 0.8,
              height: visual === "candle" ? size * 0.6 : size * 0.3,
              borderRadius: visual === "candle" ? 8 : "50%",
              background: visual === "candle" ? "#f3e5c0" : visual === "diya" ? "#b5651d" : "#2f8f4e",
              marginTop: 4,
            }}
          >
            <span style={{ ...label, color: visual === "candle" ? "#5a4a2a" : "#fff", fontSize: size * 0.09 }}>{name}</span>
          </div>
        </div>
      );
    case "star":
    default:
      return (
        <div style={{ ...flex, flexDirection: "column", width: size, height: size }}>
          <div style={{ ...flex, position: "relative", width: size * 0.5, height: size * 0.5 }}>
            {[0, 45, 90, 135].map((deg) => (
              <div key={deg} style={{ position: "absolute", width: size * 0.5, height: size * (deg % 90 ? 0.03 : 0.06), borderRadius: size, background: "#fff", transform: `rotate(${deg}deg)`, boxShadow: glowOn ? `0 0 ${size * 0.15}px hsl(${hue} 90% 70%)` : "none" }} />
            ))}
            <div style={{ position: "absolute", width: size * 0.12, height: size * 0.12, borderRadius: "50%", background: "#fff", boxShadow: glowOn ? `0 0 ${size * 0.3}px hsl(${hue} 90% 75%)` : "none" }} />
          </div>
          <span style={{ ...label, color: "#fff", fontSize: size * 0.12 }}>{name}</span>
        </div>
      );
  }
}

export function WishCard({ channel, locale, text, author, referrals, count, url, format, fontFamily, rarity = "COMMON", relicName }: CardInput) {
  const rs = RARITY_STYLE[rarity];
  const isRare = rarity !== "COMMON";
  const { width, height } = CARD_SIZES[format];
  const copy = CARD_COPY[locale];
  const vertical = format === "story";
  const pad = width * 0.07;
  const tokenSize = vertical ? width * 0.5 : Math.min(height * 0.55, width * 0.3);
  const name = author ?? "";
  const textSize = Math.min(vertical ? width * 0.065 : height * 0.075, format === "square" ? 56 : 72) * (text.length > 90 ? 0.75 : 1);
  const host = url.replace(/^https?:\/\//, "").split("/")[0];

  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        alignItems: "center",
        justifyContent: vertical ? "space-between" : "center",
        padding: pad,
        fontFamily: `"${fontFamily}", "Noto Sans", sans-serif`,
        color: "#f3efe6",
        background: isRare
          ? `radial-gradient(circle at ${vertical ? "50% 25%" : "25% 50%"}, ${rs.glow}, hsl(${channel.hue} 45% 14%) 45%, #0b0a12 75%)`
          : `radial-gradient(circle at ${vertical ? "50% 25%" : "25% 50%"}, hsl(${channel.hue} 45% 22%), #0b0a12 60%)`,
        border: isRare ? `${vertical ? 14 : 10}px solid ${rs.color}` : "0px solid transparent",
      }}
    >
      {isRare && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, position: "absolute", top: pad * 0.5, left: pad * 0.5, padding: "8px 18px", borderRadius: 999, background: rs.color, color: "#141018", fontWeight: 700, fontSize: vertical ? 30 : 22 }}>
          <div style={{ width: vertical ? 16 : 12, height: vertical ? 16 : 12, background: "#141018", transform: "rotate(45deg)" }} />
          <div style={{ display: "flex" }}>{rs.label[locale]}{relicName ? ` - ${relicName}` : ""}</div>
        </div>
      )}
      {/* Token */}
      <div style={S({ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, flexShrink: 0, marginRight: vertical ? 0 : pad })}>
        <Token visual={channel.visual} name={name} hue={channel.hue} size={tokenSize} />
        <div style={{ display: "flex", fontSize: vertical ? 34 : 24, color: "#f0b35b", fontWeight: 700 }}>
          {channel.name[locale]}
        </div>
        <div style={{ display: "flex", fontSize: vertical ? 26 : 20, color: "#a39d90" }}>
          {count.toLocaleString()} {channel.unit[locale]}
        </div>
      </div>

      {/* Text */}
      <div style={S({ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, width: vertical ? "100%" : "auto", minWidth: 0 })}>
        <div style={{ display: "flex", fontSize: textSize, fontWeight: 700, lineHeight: 1.3, textAlign: vertical ? "center" : "left", justifyContent: vertical ? "center" : "flex-start", wordBreak: "break-word" }}>
          “{text.length > 140 ? text.slice(0, 137) + "…" : text}”
        </div>
        {author && (
          <div style={{ display: "flex", marginTop: 20, fontSize: vertical ? 30 : 24, color: "#a39d90", justifyContent: vertical ? "center" : "flex-start" }}>
            — {author}
          </div>
        )}
        {referrals > 0 && (
          <div style={{ display: "flex", marginTop: 16, fontSize: vertical ? 26 : 20, color: "#f0b35b", justifyContent: vertical ? "center" : "flex-start" }}>
            {copy.joined(referrals)}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={S({
          display: "flex",
          flexDirection: vertical ? "column" : "row",
          alignItems: "center",
          gap: 10,
          position: vertical ? "relative" : "absolute",
          ...(vertical ? {} : { bottom: pad * 0.6, right: pad }),
          fontSize: vertical ? 30 : 22,
          color: "#a39d90",
        })}
      >
        <div style={{ display: "flex", color: "#f3efe6", fontWeight: 700 }}>{copy.cta}</div>
        <div style={{ display: "flex" }}>{host}</div>
      </div>
    </div>
  );
}
