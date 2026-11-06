import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DB_PATH = ":memory:"; process.env.PAYMENT_PROVIDERS = "mock"; process.env.RATE_PER_MIN = "100";
process.env.FIRMAMENT_M = "0.36"; // 4 stones of 9 cm
const S = await import("./server.js");
const { addStone, addSeedStone, createWallet, walletState, pendingEventReward, firmamentStones, recent, server, FIRMAMENT_REWARD, FIRMAMENT_KEYSTONE_REWARD } = S;

test("the firmament touch fires once, rewards every wisher, marks the keystone, and tells each wallet once", () => {
  assert.equal(firmamentStones(), 4);
  const a = createWallet(), b = createWallet(), late = createWallet();
  const t0 = Date.now();
  addStone(a, { wish: "first" }, t0); addSeedStone({ name: "seed", wish: "seeded" }); addStone(b, { wish: "third" }, t0 + 1);
  assert.equal(pendingEventReward(a), null, "nothing yet");
  const r = addStone(a, { name: "Key", wish: "the fourth" }, t0 + 86_400_000); // a's free slot is back
  assert.equal(r.stone.keystone, 1, "the touching stone is the keystone");
  assert.equal(recent(10).filter((s) => s.keystone).length, 1);
  assert.equal(r.wallet.credits, FIRMAMENT_REWARD + FIRMAMENT_KEYSTONE_REWARD, "keystone owner: gift + keystone reward");
  assert.equal(walletState(S.walletByToken(b.token)).credits, FIRMAMENT_REWARD, "every wisher gets the gift");
  assert.equal(walletState(S.walletByToken(late.token)).credits, 0, "a wallet that never stacked gets nothing");
  const ra = pendingEventReward(a); assert.equal(ra.credits, FIRMAMENT_REWARD + FIRMAMENT_KEYSTONE_REWARD); assert.equal(ra.keystone, true);
  assert.equal(pendingEventReward(a), null, "told once");
  assert.equal(pendingEventReward(b).credits, FIRMAMENT_REWARD); assert.equal(pendingEventReward(late).credits, 0);
  // more stones never fire it again
  const r2 = addStone(late, { wish: "after" }, t0 + 2); assert.equal(r2.stone.keystone, 0);
  assert.equal(walletState(S.walletByToken(b.token)).credits, FIRMAMENT_REWARD, "no second gift");
});
after(() => server.close());
