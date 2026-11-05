import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { captureOrder } from "@/lib/payments/paypal";
import { settlePayment, afterPaymentUrl } from "@/lib/wishes";

export const runtime = "nodejs";

/** PayPal sends the buyer back here after approval. We capture, then show the wish. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const paymentId = url.searchParams.get("p");
  const orderId = url.searchParams.get("token");
  const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  if (!paymentId || !orderId) return NextResponse.redirect(`${base}/`);

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.providerRef !== orderId) return NextResponse.redirect(`${base}/`);

  if (payment.status === "CREATED") {
    try {
      const { completed, raw } = await captureOrder(orderId);
      if (completed) await settlePayment({ provider: "paypal", paymentId, outcome: "PAID", raw });
    } catch (err) {
      console.error("paypal capture", err);
    }
  }
  return NextResponse.redirect(afterPaymentUrl(base, payment));
}
