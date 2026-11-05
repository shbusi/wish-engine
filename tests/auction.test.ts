import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "wish-engine-auction-"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

let prisma: typeof import("../src/lib/db").prisma;
let A: typeof import("../src/lib/auctions");
let R: typeof import("../src/lib/relics");

before(async () => {
  ({ prisma } = await import("../src/lib/db"));
  A = await import("../src/lib/auctions");
  R = await import("../src/lib/relics");
  await prisma.channel.create({ data: { id: "stone-cairn" } });
});
after(async () => prisma.$disconnect());

async function wallet(credits: number) {
  return prisma.creditWallet.create({ data: { token: `WE-T${Math.random()}`, credits } });
}
async function relicFor(ownerId: string, rarity = "RARE") {
  const wish = await prisma.wish.create({ data: { channelId: "stone-cairn", text: "lucky", status: "OFFERED", offeredAt: new Date(), walletId: ownerId, rarity } });
  return prisma.relic.create({ data: { wishId: wish.id, channelId: "stone-cairn", rarity, variantId: `stone-cairn:${rarity}`, finderWalletId: ownerId, ownerWalletId: ownerId } });
}

test("rarity roll respects odds and only non-common tiers mint", () => {
  assert.equal(R.rollRarity(() => 0), "LEGENDARY");
  assert.equal(R.rollRarity(() => 9), "LEGENDARY");
  assert.equal(R.rollRarity(() => 10), "RARE");
  assert.equal(R.rollRarity(() => 99), "RARE");
  assert.equal(R.rollRarity(() => 100), "UNCOMMON");
  assert.equal(R.rollRarity(() => 599), "UNCOMMON");
  assert.equal(R.rollRarity(() => 600), "COMMON");
  assert.equal(R.rollRarity(() => 9999), "COMMON");
  for (const ch of Object.keys(R.RELIC_VARIANTS)) for (const tier of R.RARE_TIERS) for (const l of ["ko", "en", "ja", "zh"] as const) assert.ok(R.relicName(ch, tier, l));
  assert.equal(R.relicName("stone-cairn", "COMMON", "ko"), "");
});

test("full auction: list, bid, outbid refund, anti-snipe, settle with fee", async () => {
  const seller = await wallet(0);
  const b1 = await wallet(50);
  const b2 = await wallet(50);
  const relic = await relicFor(seller.id, "RARE");

  await assert.rejects(A.createAuction({ relicId: relic.id, walletId: b1.id, hours: 24 }), /not_owner/);
  await assert.rejects(A.createAuction({ relicId: relic.id, walletId: seller.id, hours: 5 }), /bad_duration/);
  const a = await A.createAuction({ relicId: relic.id, walletId: seller.id, hours: 24, minBidCredits: 1 });
  assert.equal(a.minBidCredits, 20, "floor for RARE is 20");
  await assert.rejects(A.createAuction({ relicId: relic.id, walletId: seller.id, hours: 24 }), /already_listed/);

  await assert.rejects(A.placeBid({ auctionId: a.id, walletId: seller.id, credits: 20 }), /own_auction/);
  await assert.rejects(A.placeBid({ auctionId: a.id, walletId: b1.id, credits: 19 }), /too_low/);
  await assert.rejects(A.placeBid({ auctionId: a.id, walletId: b1.id, credits: 51 }), /insufficient_credits/);

  await A.placeBid({ auctionId: a.id, walletId: b1.id, credits: 20 });
  assert.equal((await prisma.creditWallet.findUnique({ where: { id: b1.id } }))!.credits, 30, "20 locked");
  await assert.rejects(A.placeBid({ auctionId: a.id, walletId: b2.id, credits: 20 }), /too_low/);
  await A.placeBid({ auctionId: a.id, walletId: b2.id, credits: 30 });
  assert.equal((await prisma.creditWallet.findUnique({ where: { id: b1.id } }))!.credits, 50, "b1 refunded");
  assert.equal((await prisma.creditWallet.findUnique({ where: { id: b2.id } }))!.credits, 20, "b2 locked 30");
  assert.equal((await prisma.bid.findFirst({ where: { walletId: b1.id } }))!.status, "OUTBID");

  await assert.rejects(A.cancelAuction(a.id, seller.id), /has_bids/);

  // Not yet due: settle is a no-op.
  assert.equal((await A.settleAuction(a.id))!.status, "OPEN");

  // Anti-snipe: move end to 1 min away, bid, end must extend to ~5 min.
  await prisma.auction.update({ where: { id: a.id }, data: { endsAt: new Date(Date.now() + 60_000) } });
  await A.placeBid({ auctionId: a.id, walletId: b1.id, credits: 40 });
  const ext = await prisma.auction.findUnique({ where: { id: a.id } });
  assert.ok(ext!.endsAt.getTime() - Date.now() > 4 * 60_000, "extended");

  // Force due and settle.
  await prisma.auction.update({ where: { id: a.id }, data: { endsAt: new Date(Date.now() - 1000) } });
  const done = await A.settleAuction(a.id);
  assert.equal(done!.status, "SETTLED");
  assert.equal(done!.winnerWalletId, b1.id);
  assert.equal(done!.winningBidCredits, 40);
  assert.equal(done!.feeCredits, 8, "20% fee");
  assert.equal((await prisma.creditWallet.findUnique({ where: { id: seller.id } }))!.credits, 32, "seller gets 32");
  assert.equal((await prisma.creditWallet.findUnique({ where: { id: b1.id } }))!.credits, 10, "b1 paid 40 of 50");
  assert.equal((await prisma.creditWallet.findUnique({ where: { id: b2.id } }))!.credits, 50, "b2 fully refunded");
  assert.equal((await prisma.relic.findUnique({ where: { id: relic.id } }))!.ownerWalletId, b1.id, "relic transferred");
  // Idempotent.
  assert.equal((await A.settleAuction(a.id))!.status, "SETTLED");
  await assert.rejects(A.placeBid({ auctionId: a.id, walletId: b2.id, credits: 100 }), /closed/);
});

test("auction with no bids ends and relic stays with seller; unbid auction can be cancelled", async () => {
  const seller = await wallet(0);
  const relic = await relicFor(seller.id, "UNCOMMON");
  const a = await A.createAuction({ relicId: relic.id, walletId: seller.id, hours: 72 });
  assert.equal(a.minBidCredits, 5);
  await prisma.auction.update({ where: { id: a.id }, data: { endsAt: new Date(Date.now() - 1000) } });
  assert.equal((await A.settleDueAuctions()), 1);
  assert.equal((await prisma.auction.findUnique({ where: { id: a.id } }))!.status, "ENDED");
  assert.equal((await prisma.relic.findUnique({ where: { id: relic.id } }))!.ownerWalletId, seller.id);

  const a2 = await A.createAuction({ relicId: relic.id, walletId: seller.id, hours: 24 });
  await A.cancelAuction(a2.id, seller.id);
  assert.equal((await prisma.auction.findUnique({ where: { id: a2.id } }))!.status, "CANCELLED");
});
