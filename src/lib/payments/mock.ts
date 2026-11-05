import type { PaymentProvider } from "./types";

/**
 * Development provider. Redirects to an in-app page where the tester
 * clicks "paid" or "failed". Never enable in production.
 */
export const mockProvider: PaymentProvider = {
  id: "mock",
  async createCheckout(input) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return {
      providerRef: `mock_${input.paymentId}`,
      redirectUrl: `${base}/pay/mock/${input.paymentId}`,
      currency: "KRW",
      amount: String(input.amountKrw),
    };
  },
  async parseWebhook(_req, rawBody) {
    const body = JSON.parse(rawBody) as {
      id: string;
      providerRef: string;
      outcome: "PAID" | "FAILED";
    };
    return { eventId: body.id, providerRef: body.providerRef, outcome: body.outcome, raw: body };
  },
};
