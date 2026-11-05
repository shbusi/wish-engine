import { createHmac, timingSafeEqual } from "node:crypto";
import { toApiAmount } from "../money";
import type { PaymentProvider, WebhookEvent } from "./types";

/**
 * Crypto provider using a Coinbase Commerce-style hosted charge API.
 * The user pays in USDC/ETH/BTC etc. on the hosted page; we price in USD.
 *
 * Any processor exposing "create charge -> hosted_url" + "HMAC-signed webhook"
 * (NOWPayments, BTCPay, Coinbase Commerce) fits this adapter with small changes.
 */
const API = process.env.CRYPTO_API_BASE ?? "https://api.commerce.coinbase.com";

export const cryptoProvider: PaymentProvider = {
  id: "crypto",

  async createCheckout(input) {
    const key = process.env.CRYPTO_API_KEY;
    if (!key) throw new Error("CRYPTO_API_KEY not configured");
    const currency = "USD";
    const amount = toApiAmount(currency, input.amountKrw);
    const res = await fetch(`${API}/charges`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CC-Api-Key": key,
        "X-CC-Version": "2018-03-22",
      },
      body: JSON.stringify({
        name: "Wish Engine offering",
        description: input.description.slice(0, 200),
        pricing_type: "fixed_price",
        local_price: { amount, currency },
        metadata: { paymentId: input.paymentId, wishId: input.wishId },
        redirect_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      }),
    });
    if (!res.ok) throw new Error(`Crypto charge create failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data: { id: string; code: string; hosted_url: string } };
    return { providerRef: json.data.code, redirectUrl: json.data.hosted_url, currency, amount };
  },

  async parseWebhook(req, rawBody): Promise<WebhookEvent | null> {
    const secret = process.env.CRYPTO_WEBHOOK_SECRET;
    if (!secret) throw new Error("CRYPTO_WEBHOOK_SECRET not configured");
    const sig = req.headers.get("x-cc-webhook-signature") ?? "";
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error("Crypto webhook signature invalid");
    }
    const body = JSON.parse(rawBody) as {
      id: string;
      event: { id: string; type: string; data: { code: string } };
    };
    const ev = body.event;
    switch (ev.type) {
      case "charge:confirmed":
      case "charge:resolved":
        return { eventId: ev.id, providerRef: ev.data.code, outcome: "PAID", raw: body };
      case "charge:failed":
        return { eventId: ev.id, providerRef: ev.data.code, outcome: "FAILED", raw: body };
      default:
        return null; // charge:created, charge:pending, charge:delayed
    }
  },
};
