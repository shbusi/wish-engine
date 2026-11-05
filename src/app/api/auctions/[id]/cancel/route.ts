import { NextResponse } from "next/server";
import { currentWallet } from "@/lib/credits";
import { cancelAuction, AuctionError } from "@/lib/auctions";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wallet = await currentWallet();
  if (!wallet) return NextResponse.json({ error: "no_wallet" }, { status: 401 });
  try {
    await cancelAuction(id, wallet.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuctionError) return NextResponse.json({ error: e.code }, { status: 400 });
    throw e;
  }
}
