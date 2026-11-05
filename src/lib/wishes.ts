import { prisma } from "./db";
import type { PaymentOutcome } from "./payments/types";

/**
 * Apply a payment outcome to its wish. Idempotent: calling with the same
 * outcome twice is a no-op, and the channel counter only moves on the
 * first transition into OFFERED.
 */
export async function settlePayment(opts: {
  provider: string;
  providerRef?: string;
  paymentId?: string;
  outcome: PaymentOutcome;
  raw?: unknown;
}) {
  const payment = opts.paymentId
    ? await prisma.payment.findUnique({ where: { id: opts.paymentId }, include: { wish: true } })
    : await prisma.payment.findFirst({
        where: { provider: opts.provider, providerRef: opts.providerRef },
        include: { wish: true },
      });
  if (!payment) return null;

  const paymentStatus = opts.outcome;
  const wishStatus =
    opts.outcome === "PAID" ? "OFFERED" : opts.outcome === "REFUNDED" ? "REFUNDED" : "FAILED";

  return prisma.$transaction(async (tx) => {
    const fresh = await tx.payment.findUnique({ where: { id: payment.id }, include: { wish: true } });
    if (!fresh) return null;
    if (fresh.status === paymentStatus) return fresh; // already applied

    const becomingOffered = fresh.wish.status !== "OFFERED" && wishStatus === "OFFERED";
    const leavingOffered = fresh.wish.status === "OFFERED" && wishStatus !== "OFFERED";

    await tx.payment.update({
      where: { id: fresh.id },
      data: {
        status: paymentStatus,
        rawEvent: opts.raw ? JSON.stringify(opts.raw).slice(0, 20_000) : undefined,
      },
    });
    await tx.wish.update({
      where: { id: fresh.wishId },
      data: {
        status: wishStatus,
        offeredAt: becomingOffered ? new Date() : fresh.wish.offeredAt,
      },
    });
    if (becomingOffered || leavingOffered) {
      await tx.channel.update({
        where: { id: fresh.wish.channelId },
        data: { wishCount: { increment: becomingOffered ? 1 : -1 } },
      });
    }
    return fresh;
  });
}

/** Record a webhook event id; returns false if we have already seen it. */
export async function claimWebhookEvent(provider: string, eventId: string): Promise<boolean> {
  try {
    await prisma.webhookEvent.create({ data: { id: `${provider}:${eventId}`, provider } });
    return true;
  } catch {
    return false;
  }
}

export const PUBLIC_WISH_SELECT = {
  id: true,
  channelId: true,
  text: true,
  author: true,
  locale: true,
  amountKrw: true,
  offeredAt: true,
} as const;

export async function listOfferedWishes(opts: { channelId?: string; cursor?: string; take?: number }) {
  const take = Math.min(Math.max(opts.take ?? 20, 1), 50);
  const rows = await prisma.wish.findMany({
    where: { status: "OFFERED", isPublic: true, ...(opts.channelId ? { channelId: opts.channelId } : {}) },
    orderBy: [{ offeredAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: PUBLIC_WISH_SELECT,
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}
