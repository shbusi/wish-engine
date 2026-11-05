import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolated SQLite db for this test run.
const dir = mkdtempSync(join(tmpdir(), "wish-engine-test-"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

let prisma: typeof import("../src/lib/db").prisma;
let settlePayment: typeof import("../src/lib/wishes").settlePayment;
let claimWebhookEvent: typeof import("../src/lib/wishes").claimWebhookEvent;
let listOfferedWishes: typeof import("../src/lib/wishes").listOfferedWishes;
let spendOneCredit: typeof import("../src/lib/credits").spendOneCredit;
let createWallet: typeof import("../src/lib/credits").createWallet;

before(async () => {
  ({ prisma } = await import("../src/lib/db"));
  ({ settlePayment, claimWebhookEvent, listOfferedWishes } = await import("../src/lib/wishes"));
  ({ spendOneCredit, createWallet } = await import("../src/lib/credits"));
  await prisma.channel.create({ data: { id: "stone-cairn" } });
});
after(async () => prisma.$disconnect());

async function makePending() {
  return prisma.wish.create({
    data: {
      channelId: "stone-cairn",
      text: "test wish",
      payment: { create: { provider: "mock", providerRef: `ref_${Math.random()}`, currency: "KRW", amount: "100", amountKrw: 100 } },
    },
    include: { payment: true },
  });
}

test("PAID settles wish to OFFERED exactly once and bumps the counter once", async () => {
  const w = await makePending();
  await settlePayment({ provider: "mock", providerRef: w.payment!.providerRef!, outcome: "PAID" });
  await settlePayment({ provider: "mock", providerRef: w.payment!.providerRef!, outcome: "PAID" }); // duplicate webhook
  const fresh = await prisma.wish.findUnique({ where: { id: w.id }, include: { payment: true } });
  assert.equal(fresh!.status, "OFFERED");
  assert.ok(fresh!.offeredAt);
  assert.equal(fresh!.payment!.status, "PAID");
  const ch = await prisma.channel.findUnique({ where: { id: "stone-cairn" } });
  assert.equal(ch!.wishCount, 1);
});

test("REFUNDED after PAID decrements the counter", async () => {
  const w = await makePending();
  await settlePayment({ provider: "mock", paymentId: w.payment!.id, outcome: "PAID" });
  await settlePayment({ provider: "mock", paymentId: w.payment!.id, outcome: "REFUNDED" });
  const fresh = await prisma.wish.findUnique({ where: { id: w.id } });
  assert.equal(fresh!.status, "REFUNDED");
  const ch = await prisma.channel.findUnique({ where: { id: "stone-cairn" } });
  assert.equal(ch!.wishCount, 1); // the first test's wish remains
});

test("FAILED keeps the wish off the wall", async () => {
  const w = await makePending();
  await settlePayment({ provider: "mock", paymentId: w.payment!.id, outcome: "FAILED" });
  const page = await listOfferedWishes({ channelId: "stone-cairn" });
  assert.ok(!page.items.some((i) => i.id === w.id));
  assert.equal(page.items.length, 1);
});

test("webhook event ids are claimed once", async () => {
  assert.equal(await claimWebhookEvent("paypal", "WH-1"), true);
  assert.equal(await claimWebhookEvent("paypal", "WH-1"), false);
  assert.equal(await claimWebhookEvent("crypto", "WH-1"), true);
});

test("unknown providerRef is a no-op", async () => {
  assert.equal(await settlePayment({ provider: "paypal", providerRef: "nope", outcome: "PAID" }), null);
});

test("credit pack: PAID adds credits once, refund claws back only what is unspent", async () => {
  const wallet = await createWallet();
  assert.match(wallet.token, /^WE-[A-Z0-9]{6}(-[A-Z0-9]{1,6}){3}$/);
  const purchase = await prisma.creditPurchase.create({
    data: {
      walletId: wallet.id, packId: "pack-10", credits: 10, amountKrw: 1000,
      payment: { create: { provider: "paypal", providerRef: "ORDER-1", currency: "USD", amount: "0.72", amountKrw: 1000 } },
    },
    include: { payment: true },
  });
  await settlePayment({ provider: "paypal", providerRef: "ORDER-1", outcome: "PAID" });
  await settlePayment({ provider: "paypal", providerRef: "ORDER-1", outcome: "PAID" });
  let w = await prisma.creditWallet.findUnique({ where: { id: wallet.id } });
  assert.equal(w!.credits, 10);

  // spend 3
  for (let i = 0; i < 3; i++) assert.equal(await spendOneCredit(prisma, wallet.id, `wish${i}`), true);
  w = await prisma.creditWallet.findUnique({ where: { id: wallet.id } });
  assert.equal(w!.credits, 7);

  await settlePayment({ provider: "paypal", paymentId: purchase.payment!.id, outcome: "REFUNDED" });
  w = await prisma.creditWallet.findUnique({ where: { id: wallet.id } });
  assert.equal(w!.credits, 0);
  const txns = await prisma.creditTxn.findMany({ where: { walletId: wallet.id } });
  assert.deepEqual(txns.map((t) => t.reason).sort(), ["purchase", "refund", "spend", "spend", "spend"]);
});

test("spending from an empty wallet fails atomically", async () => {
  const wallet = await createWallet();
  assert.equal(await spendOneCredit(prisma, wallet.id, "x"), false);
  const w = await prisma.creditWallet.findUnique({ where: { id: wallet.id } });
  assert.equal(w!.credits, 0);
});
