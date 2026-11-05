import { NextResponse } from "next/server";
import { z } from "zod";
import { currentWallet } from "@/lib/credits";
import { placeBid, AuctionError } from "@/lib/auctions";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`bid:${clientKey(req)}`, 30, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { id } = await params;
  const parsed = z.object({ credits: z.number().int().min(1) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const wallet = await currentWallet();
  if (!wallet) return NextResponse.json({ error: "no_wallet" }, { status: 401 });
  try {
    const r = await placeBid({ auctionId: id, walletId: wallet.id, credits: parsed.data.credits });
    return NextResponse.json({ ok: true, bidId: r.bid.id });
  } catch (e) {
    if (e instanceof AuctionError) return NextResponse.json({ error: e.code }, { status: e.code === "insufficient_credits" ? 402 : 400 });
    throw e;
  }
}
