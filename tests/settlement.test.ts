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

before(async () => {
  ({ prisma } = await import("../src/lib/db"));
  ({ settlePayment, claimWebhookEvent, listOfferedWishes } = await import("../src/lib/wishes"));
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
