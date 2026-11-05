import { NextResponse } from "next/server";
import { getProvider } from "@/lib/payments";
import { settlePayment, afterPaymentUrl } from "@/lib/wishes";

export const runtime = "nodejs";

/** Development only: simulate a provider webhook for the mock provider. */
export async function POST(req: Request) {
  if (!getProvider("mock")) return NextResponse.json({ error: "disabled" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { paymentId?: string; outcome?: string } | null;
  if (!body?.paymentId || (body.outcome !== "PAID" && body.outcome !== "FAILED")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const p = await settlePayment({ provider: "mock", paymentId: body.paymentId, outcome: body.outcome });
  if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  return NextResponse.json({ ok: true, wishId: p.wishId, nextUrl: afterPaymentUrl(base, p) });
}
