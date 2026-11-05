/**
 * Pure timeline for the "drop moment" video. Everything is a function of
 * time so frames are deterministic and testable without rendering.
 *
 *  0.0–0.9s  title + wish text fade in; object waits off-screen
 *  0.9–2.2s  object drops (or rises, for lanterns) into place
 *  2.2–2.6s  impact flash, name inscribed
 *  2.6–end   rare: frame + badge pop in · common: counter + CTA
 */
export const VIDEO = { width: 1080, height: 1920, fps: 20, seconds: 4.8 } as const;
export const FRAME_COUNT = Math.round(VIDEO.fps * VIDEO.seconds);

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
/** Bounce at the end of a fall, like a stone settling. */
export const easeOutBounce = (t: number) => {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

export interface FrameSpec {
  /** 0..1 opacity of the title block */
  title: number;
  /** vertical offset of the object in px (negative = above resting spot) */
  objectY: number;
  objectScale: number;
  objectOpacity: number;
  /** white flash overlay opacity */
  flash: number;
  /** expanding glow ring radius factor 0..1 */
  ring: number;
  /** name visible on the object */
  name: number;
  /** rarity border width factor 0..1 (rare only) */
  border: number;
  /** rarity badge scale (rare only) */
  badge: number;
  /** CTA block opacity */
  cta: number;
  /** counter value shown (0..count) */
  counter: number;
}

export function frameAt(t: number, opts: { rare: boolean; rises: boolean; count: number }): FrameSpec {
  const title = clamp01(t / 0.6);
  const dropT = clamp01((t - 0.9) / 1.3);
  const settle = opts.rises ? easeOutCubic(dropT) : easeOutBounce(dropT);
  const start = opts.rises ? 900 : -1100;
  const objectY = t < 0.9 ? start : lerp(start, 0, settle);
  const objectScale = lerp(0.82, 1, easeOutCubic(dropT));
  const objectOpacity = clamp01((t - 0.85) / 0.25);
  const impactT = clamp01((t - 2.2) / 0.4);
  const flash = impactT === 0 || impactT === 1 ? 0 : Math.sin(impactT * Math.PI) * (opts.rare ? 0.75 : 0.35);
  const ring = impactT;
  const name = clamp01((t - 2.25) / 0.3);
  const revealT = clamp01((t - 2.6) / 0.6);
  const border = opts.rare ? easeOutCubic(revealT) : 0;
  const badge = opts.rare ? (revealT === 0 ? 0 : easeOutBack(revealT)) : 0;
  const cta = clamp01((t - 3.2) / 0.5);
  const counter = Math.round(lerp(Math.max(0, opts.count - 1), opts.count, clamp01((t - 2.4) / 0.6)));
  return { title, objectY, objectScale, objectOpacity, flash, ring, name, border, badge, cta, counter };
}

export function timeOfFrame(i: number): number {
  return i / VIDEO.fps;
}
