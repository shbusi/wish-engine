import { NextResponse } from "next/server";
import { z } from "zod";
import { currentWallet } from "@/lib/credits";
import { createAuction, AuctionError } from "@/lib/auctions";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

const Body = z.object({ relicId: z.string(), hours: z.number().int(), minBidCredits: z.number().int().min(1).max(100_000).optional() });

/** POST /api/auctions — list a relic you own. */
export async function POST(req: Request) {
  if (!rateLimit(`auction:${clientKey(req)}`, 10, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const wallet = await currentWallet();
  if (!wallet) return NextResponse.json({ error: "no_wallet" }, { status: 401 });
  try {
    const a = await createAuction({ ...parsed.data, walletId: wallet.id });
    return NextResponse.json({ auctionId: a.id });
  } catch (e) {
    if (e instanceof AuctionError) return NextResponse.json({ error: e.code }, { status: 400 });
    throw e;
  }
}
