import { NextResponse } from "next/server";
import { settleDueAuctions } from "@/lib/auctions";

export const runtime = "nodejs";

/** GET /api/auctions/settle — cron target (also runs lazily on auction pages). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const n = await settleDueAuctions();
  return NextResponse.json({ settled: n });
}
