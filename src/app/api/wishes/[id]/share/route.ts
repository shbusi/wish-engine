import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** POST /api/wishes/:id/share — count a share click. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`share:${clientKey(req)}`, 30, 60_000)) return NextResponse.json({ ok: true });
  const { id } = await params;
  const r = await prisma.wish.updateMany({ where: { id, status: "OFFERED" }, data: { shareCount: { increment: 1 } } });
  return NextResponse.json({ ok: r.count === 1 });
}
