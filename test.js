import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DB_PATH = ":memory:";
process.env.PAYMENT_PROVIDERS = "mock";
process.env.RATE_PER_MIN = "100";
process.env.ADMIN_TOKEN = "test-admin";
const S = await import("./server.js");
const { addStone, count, recent, after: afterId, createWallet, walletState, createOrder, settleOrder, server, STONE_CM, FREE_EVERY_MS, PACK } = S;

test("free stone once per period, then credits, with validation", () => {
  const w = createWallet();
  assert.equal(walletState(w).freeNow, true);
  assert.throws(() => addStone(w, { wish: "x" }), /too_short/);
  assert.throws(() => addStone(w, { wish: "a".repeat(141) }), /too_long/);
  assert.throws(() => addStone(w, { wish: "visit http://spam.io" }), /rejected/);

  const t0 = 1_000_000;
  const a = addStone(w, { name: "  민준 ", wish: "  엄마   건강  " }, t0);
  assert.equal(a.stone.name, "민준");
  assert.equal(a.stone.wish, "엄마 건강");
  assert.equal(a.stone.paid, undefined, "paid flag is internal");
  assert.equal(a.wallet.freeNow, false);
  assert.equal(a.wallet.nextFreeAt, t0 + FREE_EVERY_MS);
  assert.equal(a.wallet.placed, 1);
  assert.equal(a.wallet.liftedCm, STONE_CM);

  // second stone within the period needs a credit
  assert.throws(() => addStone(w, { wish: "취업" }, t0 + 1000), /need_credits/);
  assert.equal(count(), 1);

  // the period passes → free again
  const b = addStone(w, { wish: "취업" }, t0 + FREE_EVERY_MS);
  assert.equal(b.stone.name, null);
  assert.equal(b.wallet.placed, 2);
  assert.deepEqual(recent(10).map((s) => s.id), [a.stone.id, b.stone.id], "oldest → newest");
  assert.deepEqual(afterId(a.stone.id).map((s) => s.id), [b.stone.id]);
});

test("buying a pack adds credits exactly once; failed orders add nothing", async () => {
  const w = createWallet();
  const o = await createOrder(w, "mock");
  assert.match(o.redirectUrl, /^\/pay\/mock\?order=/);
  assert.equal(settleOrder(o.id, true).status, "PAID");
  assert.equal(settleOrder(o.id, true).status, "PAID", "idempotent");
  assert.equal(walletState(S.walletByToken(w.token)).credits, PACK.stones);

  const bad = await createOrder(w, "mock");
  assert.equal(settleOrder(bad.id, false).status, "FAILED");
  assert.equal(walletState(S.walletByToken(w.token)).credits, PACK.stones);
  await assert.rejects(createOrder(w, "paypal"), /no_provider/);

  // spend: free first, then credits
  const t = 5_000_000;
  addStone(w, { wish: "free one" }, t);
  for (let i = 0; i < PACK.stones; i++) addStone(w, { wish: `paid ${i}` }, t + 1);
  assert.equal(walletState(S.walletByToken(w.token)).credits, 0);
  assert.throws(() => addStone(w, { wish: "one more" }, t + 2), /need_credits/);
});

test("http: wallet cookie, post → sse → list, 402 when out of stones", async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  const me = await fetch(`${base}/api/me`);
  const cookie = me.headers.get("set-cookie").split(";")[0];
  assert.match(cookie, /^cairn_w=/);
  const meJ = await me.json();
  assert.equal(meJ.wallet.freeNow, true);
  assert.deepEqual(meJ.providers, ["mock"]);

  const sse = await fetch(`${base}/api/events`);
  const reader = sse.body.getReader(); const dec = new TextDecoder();
  let buf = dec.decode((await reader.read()).value);
  assert.match(buf, /"type":"hello"/);

  const post = (body) => fetch(`${base}/api/stones`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body) });
  const r1 = await post({ wish: "함께 빌어요", name: "서연" });
  assert.equal(r1.status, 201);
  const j1 = await r1.json();
  assert.equal(j1.stone.name, "서연");
  assert.equal(j1.wallet.freeNow, false);
  assert.equal(typeof j1.total, "number");

  for (let i = 0; i < 5 && !buf.includes('"type":"stone"'); i++) buf += dec.decode((await reader.read()).value);
  assert.match(buf, /"type":"stone".*함께 빌어요/);

  const r2 = await post({ wish: "another" });
  assert.equal(r2.status, 402);
  const j2 = await r2.json();
  assert.equal(j2.error, "need_credits");
  assert.equal(j2.pack.stones, PACK.stones);

  const buy = await fetch(`${base}/api/buy`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ provider: "mock" }) }).then((r) => r.json());
  assert.match(buy.redirectUrl, /\/pay\/mock\?order=/);
  const pay = await fetch(base + buy.redirectUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) }).then((r) => r.json());
  assert.equal(pay.status, "PAID");
  const r3 = await post({ wish: "paid stone" });
  assert.equal(r3.status, 201);
  assert.equal((await r3.json()).wallet.credits, PACK.stones - 1);

  const list = await fetch(`${base}/api/stones`).then((r) => r.json());
  assert.equal(list.stones.at(-1).wish, "paid stone");
  const html = await fetch(`${base}/`).then((r) => r.text());
  assert.match(html, /Wish Cairn/);
  // seeding: operator token required; backfilled stones don't broadcast, live ones do
  const adminPost = (body, token) => fetch(`${base}/api/admin/stones`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "x-admin-token": token } : {}) }, body: JSON.stringify(body) });
  assert.equal((await adminPost({ wish: "nope" })).status, 401);
  assert.equal((await adminPost({ wish: "nope" }, "wrong")).status, 401);
  const old = await adminPost({ name: "Yuki", wish: "合格しますように", createdAt: Date.now() - 3 * 86_400_000 }, "test-admin");
  assert.equal(old.status, 201);
  const liveSeed = await adminPost({ wish: "live seed" }, "test-admin");
  assert.equal(liveSeed.status, 201);
  for (let i = 0; i < 5 && !buf.includes("live seed"); i++) buf += dec.decode((await reader.read()).value);
  assert.match(buf, /live seed/);
  assert.doesNotMatch(buf, /合格しますように/, "backfilled stones are not broadcast");
  assert.equal(S.botCount(), 2);
  const pub = await fetch(`${base}/api/stones`).then((r) => r.json());
  assert.equal("bot" in pub.stones.at(-1), false, "bot flag never leaves the server");

  const trav = await fetch(`${base}/vendor/three/../../server.js`);
  assert.notEqual(trav.status, 200);
  await reader.cancel();
});

after(() => server.close());
