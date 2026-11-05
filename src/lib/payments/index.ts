import { mockProvider } from "./mock";
import { paypalProvider } from "./paypal";
import { cryptoProvider } from "./crypto";
import type { PaymentProvider, ProviderId } from "./types";

const ALL: Record<ProviderId, PaymentProvider> = {
  mock: mockProvider,
  paypal: paypalProvider,
  crypto: cryptoProvider,
};

/** Providers exposed to users, from PAYMENT_PROVIDERS env (comma separated). */
export function enabledProviders(): ProviderId[] {
  const raw = process.env.PAYMENT_PROVIDERS ?? "mock";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ProviderId => s in ALL);
  // Never expose mock in production unless explicitly allowed (staging).
  const mockAllowed = process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCK_PAYMENTS === "1";
  const safe = mockAllowed ? ids : ids.filter((i) => i !== "mock");
  return safe.length ? safe : mockAllowed ? ["mock"] : [];
}

export function getProvider(id: string): PaymentProvider | null {
  if (!enabledProviders().includes(id as ProviderId)) return null;
  return ALL[id as ProviderId] ?? null;
}

export type { PaymentProvider, ProviderId } from "./types";
