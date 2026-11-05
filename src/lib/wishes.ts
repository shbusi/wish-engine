import { prisma } from "./db";
import type { PaymentOutcome } from "./payments/types";
import { rollRarity, variantId } from "./relics";
import type { Prisma } from "@prisma/client";

/**
 * Roll rarity for a wish that just became OFFERED and mint a Relic for the
 * wisher's wallet if it is anything above COMMON. Runs inside the caller's transaction.
 */
export async function rollAndMintRelic(tx: Prisma.TransactionClient, wish: { id: string; channelId: string; walletId: string | null; rarity: string }) {
  if (wish.rarity !== "COMMON") return wish.rarity; // already rolled
  const rarity = rollRarity();
  await tx.wish.update({ where: { id: wish.id }, data: { rarity } });
  if (rarity !== "COMMON" && wish.walletId) {
    await tx.relic.create({
      data: { wishId: wish.id, channelId: wish.channelId, rarity, variantId: variantId(wish.channelId, rarity), finderWalletId: wish.walletId, ownerWalletId: wish.walletId },
    });
  }
  return rarity;
}

/**
 * Apply a payment outcome to whatever the payment is for — a wish or a
 * credit-pack purchase. Idempotent: the same outcome twice is a no-op,
 * channel counters and wallet balances only move on the first transition.
 */
export async function settlePayment(opts: {
  provider: string;
  providerRef?: string;
  paymentId?: string;
  outcome: PaymentOutcome;
  raw?: unknown;
}) {
  const payment = opts.paymentId
    ? await prisma.payment.findUnique({ where: { id: opts.paymentId } })
    : await prisma.payment.findFirst({ where: { provider: opts.provider, providerRef: opts.providerRef } });
  if (!payment) return null;

  const paymentStatus = opts.outcome;

  return prisma.$transaction(async (tx) => {
    const fresh = await tx.payment.findUnique({
      where: { id: payment.id },
      include: { wish: true, purchase: true },
    });
    if (!fresh) return null;
    if (fresh.status === paymentStatus) return fresh; // already applied

    await tx.payment.update({
      where: { id: fresh.id },
      data: {
        status: paymentStatus,
        rawEvent: opts.raw ? JSON.stringify(opts.raw).slice(0, 20_000) : undefined,
      },
    });

    if (fresh.wish) {
      const wishStatus =
        opts.outcome === "PAID" ? "OFFERED" : opts.outcome === "REFUNDED" ? "REFUNDED" : "FAILED";
      const becomingOffered = fresh.wish.status !== "OFFERED" && wishStatus === "OFFERED";
      const leavingOffered = fresh.wish.status === "OFFERED" && wishStatus !== "OFFERED";
      await tx.wish.update({
        where: { id: fresh.wish.id },
        data: { status: wishStatus, offeredAt: becomingOffered ? new Date() : fresh.wish.offeredAt },
      });
      if (becomingOffered) await rollAndMintRelic(tx, fresh.wish);
      if (becomingOffered || leavingOffered) {
        await tx.channel.update({
          where: { id: fresh.wish.channelId },
          data: { wishCount: { increment: becomingOffered ? 1 : -1 } },
        });
        if (fresh.wish.viaWishId) {
          await tx.wish.updateMany({
            where: { id: fresh.wish.viaWishId },
            data: { referrals: { increment: becomingOffered ? 1 : -1 } },
          });
        }
      }
    }

    if (fresh.purchase) {
      const p = fresh.purchase;
      const wasPaid = p.status === "PAID";
      const nowPaid = opts.outcome === "PAID";
      await tx.creditPurchase.update({ where: { id: p.id }, data: { status: opts.outcome } });
      if (!wasPaid && nowPaid) {
        await tx.creditWallet.update({ where: { id: p.walletId }, data: { credits: { increment: p.credits } } });
        await tx.creditTxn.create({ data: { walletId: p.walletId, delta: p.credits, reason: "purchase", refId: p.id } });
      } else if (wasPaid && !nowPaid) {
        // Refund: claw back what is still unspent, never below zero.
        const w = await tx.creditWallet.findUnique({ where: { id: p.walletId } });
        const clawback = Math.min(w?.credits ?? 0, p.credits);
        if (clawback > 0) {
          await tx.creditWallet.update({ where: { id: p.walletId }, data: { credits: { decrement: clawback } } });
          await tx.creditTxn.create({ data: { walletId: p.walletId, delta: -clawback, reason: "refund", refId: p.id } });
        }
      }
    }
    return fresh;
  });
}

/** Where to send the user after a payment resolves. */
export function afterPaymentUrl(base: string, payment: { wishId: string | null; purchaseId: string | null }): string {
  if (payment.wishId) return `${base}/w/${payment.wishId}`;
  if (payment.purchaseId) return `${base}/credits?purchase=${payment.purchaseId}`;
  return `${base}/`;
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
  referrals: true,
  rarity: true,
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
