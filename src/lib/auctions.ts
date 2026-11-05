import { prisma } from "./db";
import { MIN_BID_BY_RARITY, type Rarity } from "./relics";

export const AUCTION_FEE_BP = Number(process.env.AUCTION_FEE_BP ?? 2000); // 20%
export const ANTI_SNIPE_MS = 5 * 60_000;
export const AUCTION_HOURS = [24, 72] as const;

export class AuctionError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** Put a relic up for auction. Only the owner can, and only one open auction per relic. */
export async function createAuction(opts: { relicId: string; walletId: string; hours: number; minBidCredits?: number }) {
  const relic = await prisma.relic.findUnique({ where: { id: opts.relicId } });
  if (!relic) throw new AuctionError("not_found");
  if (relic.ownerWalletId !== opts.walletId) throw new AuctionError("not_owner");
  if (!(AUCTION_HOURS as readonly number[]).includes(opts.hours)) throw new AuctionError("bad_duration");
  const open = await prisma.auction.findFirst({ where: { relicId: relic.id, status: "OPEN" } });
  if (open) throw new AuctionError("already_listed");
  const floor = MIN_BID_BY_RARITY[relic.rarity as Exclude<Rarity, "COMMON">] ?? 1;
  const minBid = Math.max(floor, opts.minBidCredits ?? floor);
  return prisma.auction.create({
    data: {
      relicId: relic.id,
      sellerWalletId: opts.walletId,
      minBidCredits: minBid,
      endsAt: new Date(Date.now() + opts.hours * 3_600_000),
    },
  });
}

/**
 * Place a bid. Locks the bidder's credits, refunds the previous high bidder.
 * Everything happens in one transaction so balances can't drift.
 */
export async function placeBid(opts: { auctionId: string; walletId: string; credits: number }) {
  if (!Number.isInteger(opts.credits) || opts.credits < 1) throw new AuctionError("bad_amount");
  return prisma.$transaction(async (tx) => {
    const a = await tx.auction.findUnique({ where: { id: opts.auctionId } });
    if (!a) throw new AuctionError("not_found");
    if (a.status !== "OPEN" || a.endsAt.getTime() <= Date.now()) throw new AuctionError("closed");
    if (a.sellerWalletId === opts.walletId) throw new AuctionError("own_auction");

    const top = await tx.bid.findFirst({ where: { auctionId: a.id, status: "ACTIVE" }, orderBy: { credits: "desc" } });
    const minimum = top ? top.credits + 1 : a.minBidCredits;
    if (opts.credits < minimum) throw new AuctionError("too_low");

    // Lock credits.
    const lock = await tx.creditWallet.updateMany({
      where: { id: opts.walletId, credits: { gte: opts.credits } },
      data: { credits: { decrement: opts.credits } },
    });
    if (lock.count === 0) throw new AuctionError("insufficient_credits");
    const bid = await tx.bid.create({ data: { auctionId: a.id, walletId: opts.walletId, credits: opts.credits } });
    await tx.creditTxn.create({ data: { walletId: opts.walletId, delta: -opts.credits, reason: "bid-lock", refId: bid.id } });

    // Refund the outbid bidder.
    if (top) {
      await tx.bid.update({ where: { id: top.id }, data: { status: "OUTBID" } });
      await tx.creditWallet.update({ where: { id: top.walletId }, data: { credits: { increment: top.credits } } });
      await tx.creditTxn.create({ data: { walletId: top.walletId, delta: top.credits, reason: "bid-refund", refId: top.id } });
    }

    // Anti-snipe: a bid in the last 5 minutes extends the auction.
    const remaining = a.endsAt.getTime() - Date.now();
    if (remaining < ANTI_SNIPE_MS) {
      await tx.auction.update({ where: { id: a.id }, data: { endsAt: new Date(Date.now() + ANTI_SNIPE_MS) } });
    }
    return { bid, minimum };
  });
}

/** Settle an auction whose time is up. Idempotent. */
export async function settleAuction(auctionId: string) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.auction.findUnique({ where: { id: auctionId }, include: { relic: true } });
    if (!a || a.status !== "OPEN" || a.endsAt.getTime() > Date.now()) return a;
    const top = await tx.bid.findFirst({ where: { auctionId: a.id, status: "ACTIVE" }, orderBy: { credits: "desc" } });
    if (!top) {
      return tx.auction.update({ where: { id: a.id }, data: { status: "ENDED" }, include: { relic: true } });
    }
    const fee = Math.floor((top.credits * AUCTION_FEE_BP) / 10_000);
    const payout = top.credits - fee;
    await tx.bid.update({ where: { id: top.id }, data: { status: "WON" } });
    await tx.relic.update({ where: { id: a.relicId }, data: { ownerWalletId: top.walletId } });
    await tx.creditWallet.update({ where: { id: a.sellerWalletId }, data: { credits: { increment: payout } } });
    await tx.creditTxn.create({ data: { walletId: a.sellerWalletId, delta: payout, reason: "sale", refId: a.id } });
    await tx.creditTxn.create({ data: { walletId: top.walletId, delta: 0, reason: "won", refId: a.id } });
    return tx.auction.update({
      where: { id: a.id },
      data: { status: "SETTLED", winnerWalletId: top.walletId, winningBidCredits: top.credits, feeCredits: fee },
      include: { relic: true },
    });
  });
}

/** Settle every auction past its end. Called lazily from pages and by the cron route. */
export async function settleDueAuctions(limit = 50) {
  const due = await prisma.auction.findMany({ where: { status: "OPEN", endsAt: { lte: new Date() } }, take: limit, select: { id: true } });
  for (const a of due) await settleAuction(a.id);
  return due.length;
}

/** Cancel an unbid auction (seller only). */
export async function cancelAuction(auctionId: string, walletId: string) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!a) throw new AuctionError("not_found");
    if (a.sellerWalletId !== walletId) throw new AuctionError("not_owner");
    if (a.status !== "OPEN") throw new AuctionError("closed");
    const anyBid = await tx.bid.findFirst({ where: { auctionId: a.id, status: "ACTIVE" } });
    if (anyBid) throw new AuctionError("has_bids");
    return tx.auction.update({ where: { id: a.id }, data: { status: "CANCELLED" } });
  });
}
