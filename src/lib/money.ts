/**
 * Money helpers. KRW is the base unit (₩100 = one minimal offering).
 * FX rates are env-configured static fallbacks; swap in a live feed later.
 */
export const BASE_KRW = Number(process.env.WISH_BASE_KRW ?? 100);
export const OFFERING_PRESETS_KRW = [100, 500, 1000, 5000] as const;
export const MAX_KRW = 1_000_000;

type Fiat = "USD" | "JPY" | "EUR" | "KRW";

const rates: Record<Fiat, number> = {
  KRW: 1,
  USD: Number(process.env.FX_USD_PER_KRW ?? 0.00072),
  JPY: Number(process.env.FX_JPY_PER_KRW ?? 0.11),
  EUR: Number(process.env.FX_EUR_PER_KRW ?? 0.00066),
};

export function krwTo(currency: Fiat, krw: number): number {
  return krw * rates[currency];
}

/** Format as a decimal string suitable for payment APIs (2dp, JPY 0dp). */
export function toApiAmount(currency: Fiat, krw: number): string {
  const v = krwTo(currency, krw);
  if (currency === "JPY" || currency === "KRW") return String(Math.max(1, Math.round(v)));
  // Providers generally reject < 0.01; clamp.
  return Math.max(0.01, v).toFixed(2);
}

export function formatKrw(krw: number, locale = "en"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(krw);
}

export function formatApprox(krw: number): string {
  const usd = krwTo("USD", krw);
  return usd < 0.1 ? `≈ $${usd.toFixed(3)}` : `≈ $${usd.toFixed(2)}`;
}

export function isValidOffering(krw: unknown): krw is number {
  return (
    typeof krw === "number" &&
    Number.isInteger(krw) &&
    krw >= BASE_KRW &&
    krw <= MAX_KRW &&
    krw % BASE_KRW === 0
  );
}
