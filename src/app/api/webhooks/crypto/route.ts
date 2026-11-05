import { NextResponse } from "next/server";
import { getProvider } from "@/lib/payments";
import { claimWebhookEvent, settlePayment } from "@/lib/wishes";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const provider = getProvider("crypto");
  if (!provider) return NextResponse.json({ error: "disabled" }, { status: 404 });
  const raw = await req.text();
  try {
    const ev = await provider.parseWebhook(req, raw);
    if (!ev) return NextResponse.json({ ok: true, ignored: true });
    if (!(await claimWebhookEvent("crypto", ev.eventId))) return NextResponse.json({ ok: true, duplicate: true });
    await settlePayment({ provider: "crypto", providerRef: ev.providerRef, outcome: ev.outcome, raw: ev.raw });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("crypto webhook", err);
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
}
