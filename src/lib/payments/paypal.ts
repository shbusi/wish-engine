import { toApiAmount } from "../money";
import type { PaymentProvider, WebhookEvent } from "./types";

/**
 * PayPal Orders API v2 (hosted checkout, CAPTURE intent).
 *
 * Flow:
 *  1. createCheckout -> POST /v2/checkout/orders -> redirect user to "payer-action" link
 *  2. PayPal returns the user to /api/paypal/return?token=<orderId>
 *  3. We capture the order there (captureOrder) and mark the wish OFFERED
 *  4. Webhook PAYMENT.CAPTURE.COMPLETED / REFUNDED as the durable source of truth
 *
 * NOTE on economics: PayPal's standard fixed fee (~$0.49 for US) exceeds a ₩100 (≈$0.07)
 * offering. Enable PayPal Micropayments pricing on the merchant account, or steer users
 * toward ₩1,000+ offerings for this provider. See README.
 */
const BASE = () =>
  (process.env.PAYPAL_ENV ?? "sandbox") === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function accessToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal credentials not configured");
  const res = await fetch(`${BASE()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export const paypalProvider: PaymentProvider = {
  id: "paypal",

  async createCheckout(input) {
    const token = await accessToken();
    const currency = "USD";
    const amount = toApiAmount(currency, input.amountKrw);
    const res = await fetch(`${BASE()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": input.paymentId, // idempotency
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: input.paymentId,
            custom_id: input.wishId,
            description: input.description.slice(0, 127),
            amount: { currency_code: currency, value: amount },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              user_action: "PAY_NOW",
              shipping_preference: "NO_SHIPPING",
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
              brand_name: "Wish Engine",
              locale: input.locale === "ko" ? "ko-KR" : input.locale === "ja" ? "ja-JP" : input.locale === "zh" ? "zh-CN" : "en-US",
            },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`PayPal order create failed: ${res.status} ${await res.text()}`);
    const order = (await res.json()) as {
      id: string;
      links: { rel: string; href: string }[];
    };
    const approve = order.links.find((l) => l.rel === "payer-action" || l.rel === "approve");
    if (!approve) throw new Error("PayPal order has no approval link");
    return { providerRef: order.id, redirectUrl: approve.href, currency, amount };
  },

  async parseWebhook(req, rawBody): Promise<WebhookEvent | null> {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID not configured");
    const token = await accessToken();
    const h = req.headers;
    const verify = await fetch(`${BASE()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: h.get("paypal-auth-algo"),
        cert_url: h.get("paypal-cert-url"),
        transmission_id: h.get("paypal-transmission-id"),
        transmission_sig: h.get("paypal-transmission-sig"),
        transmission_time: h.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody),
      }),
    });
    const v = (await verify.json()) as { verification_status: string };
    if (v.verification_status !== "SUCCESS") throw new Error("PayPal webhook signature invalid");

    const event = JSON.parse(rawBody) as {
      id: string;
      event_type: string;
      resource: { id: string; supplementary_data?: { related_ids?: { order_id?: string } } };
    };
    const orderId = event.resource.supplementary_data?.related_ids?.order_id;
    if (!orderId) return null;
    switch (event.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED":
        return { eventId: event.id, providerRef: orderId, outcome: "PAID", raw: event };
      case "PAYMENT.CAPTURE.DENIED":
      case "PAYMENT.CAPTURE.DECLINED":
        return { eventId: event.id, providerRef: orderId, outcome: "FAILED", raw: event };
      case "PAYMENT.CAPTURE.REFUNDED":
      case "PAYMENT.CAPTURE.REVERSED":
        return { eventId: event.id, providerRef: orderId, outcome: "REFUNDED", raw: event };
      default:
        return null;
    }
  },
};

/** Capture an approved order. Returns true when the capture completed. */
export async function captureOrder(orderId: string): Promise<{ completed: boolean; raw: unknown }> {
  const token = await accessToken();
  const res = await fetch(`${BASE()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `capture_${orderId}`,
    },
  });
  const raw = await res.json().catch(() => ({}));
  const status = (raw as { status?: string }).status;
  return { completed: res.ok && status === "COMPLETED", raw };
}
