import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const dayAgo = new Date(Date.now() - 86_400_000);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [channels, total, today, week] = await Promise.all([
    prisma.channel.findMany({ select: { id: true, wishCount: true } }),
    prisma.wish.count({ where: { status: "OFFERED" } }),
    prisma.wish.count({ where: { status: "OFFERED", offeredAt: { gte: dayAgo } } }),
    prisma.wish.count({ where: { status: "OFFERED", offeredAt: { gte: weekAgo } } }),
  ]);
  return NextResponse.json(
    { total, today, week, channels: Object.fromEntries(channels.map((c) => [c.id, c.wishCount])) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
