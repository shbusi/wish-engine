export type ProviderId = "mock" | "paypal" | "crypto";

export interface CheckoutInput {
  paymentId: string;
  wishId: string;
  amountKrw: number;
  locale: string;
  /** Where the provider should send the user afterwards. */
  returnUrl: string;
  cancelUrl: string;
  description: string;
}

export interface CheckoutResult {
  providerRef: string;
  redirectUrl: string;
  currency: string;
  amount: string;
}

export type PaymentOutcome = "PAID" | "FAILED" | "REFUNDED";

export interface WebhookEvent {
  eventId: string;
  providerRef: string;
  outcome: PaymentOutcome;
  raw: unknown;
}

export interface PaymentProvider {
  id: ProviderId;
  /** Create a hosted checkout and return where to send the user. */
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /** Verify and parse an incoming webhook. Return null if it is not an event we care about. */
  parseWebhook(req: Request, rawBody: string): Promise<WebhookEvent | null>;
}
