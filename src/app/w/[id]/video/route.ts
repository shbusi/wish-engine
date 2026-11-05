import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { getChannel } from "@/lib/channels";
import { isLocale } from "@/lib/i18n";
import { relicName, type Rarity } from "@/lib/relics";
import { ensureVideoJob, getJob, videoExists, videoPath } from "@/lib/video";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /w/:id/video            → 200 video/mp4 when ready, else 202 { status, progress } and starts rendering
 * GET /w/:id/video?status=1   → JSON status only (never starts a job)
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const statusOnly = url.searchParams.get("status") === "1";

  if (await videoExists(id)) {
    if (statusOnly) return NextResponse.json({ status: "done", progress: 1 });
    const p = videoPath(id);
    const size = (await stat(p)).size;
    const stream = Readable.toWeb(createReadStream(p)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(size),
        "Content-Disposition": `inline; filename="wish-${id}.mp4"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const job = getJob(id);
  if (statusOnly) return NextResponse.json(job ?? { status: "none", progress: 0 }, { status: job ? 202 : 404 });
  if (job && job.status !== "error") return NextResponse.json({ status: job.status, progress: job.progress }, { status: 202 });

  if (!rateLimit(`video:${clientKey(req)}`, 5, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const wish = await prisma.wish.findUnique({ where: { id }, include: { channel: true } });
  if (!wish || wish.status !== "OFFERED" || !wish.isPublic) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const channel = getChannel(wish.channelId);
  if (!channel) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const locale = isLocale(wish.locale) ? wish.locale : "en";
  const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  const started = ensureVideoJob({
    wishId: wish.id,
    channel,
    locale,
    text: wish.text,
    author: wish.author,
    rarity: wish.rarity as Rarity,
    relicName: relicName(wish.channelId, wish.rarity as Rarity, locale),
    count: wish.channel.wishCount,
    url: `${base}/w/${wish.id}`,
  });
  return NextResponse.json({ status: started.status, progress: started.progress }, { status: 202 });
}
