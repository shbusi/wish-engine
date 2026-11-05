import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { settlePayment, afterPaymentUrl } from "@/lib/wishes";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const paymentId = url.searchParams.get("p");
  const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  if (!paymentId) return NextResponse.redirect(`${base}/`);
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return NextResponse.redirect(`${base}/`);
  if (payment.status === "CREATED") await settlePayment({ provider: "paypal", paymentId, outcome: "FAILED" });
  return NextResponse.redirect(afterPaymentUrl(base, payment));
}
