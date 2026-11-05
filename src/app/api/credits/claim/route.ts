import { NextResponse } from "next/server";
import { z } from "zod";
import { walletByToken, WALLET_COOKIE, WALLET_COOKIE_OPTS } from "@/lib/credits";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** POST /api/credits/claim { token } — attach an existing wallet to this browser via its recovery code. */
export async function POST(req: Request) {
  if (!rateLimit(`claim:${clientKey(req)}`, 5, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = z.object({ token: z.string().min(8).max(64) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const wallet = await walletByToken(parsed.data.token);
  if (!wallet) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const res = NextResponse.json({ ok: true, credits: wallet.credits });
  res.cookies.set(WALLET_COOKIE, wallet.token, WALLET_COOKIE_OPTS);
  return res;
}
