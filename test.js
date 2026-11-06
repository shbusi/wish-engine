import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DB_PATH = ":memory:";
process.env.PAYMENT_PROVIDERS = "mock";
process.env.RATE_PER_MIN = "100";
process.env.ADMIN_TOKEN = "test-admin";
const S = await import("./server.js");
const { addStone, count, recent, after: afterId, createWallet, walletState, createOrder, settleOrder, server, STONE_CM, FREE_EVERY_MS, PACK, bless, stoneById, newBlessings, FREE_BLESS_PER_DAY } = S;

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

test("sealed wish: costs one extra stone, text hidden from everyone but the owner", async () => {
  const w = createWallet();
  const t0 = 5_000_000;
  // free stone available but sealing needs a credit → nothing is spent
  assert.throws(() => addStone(w, { wish: "secret hope", sealed: true }, t0), /need_credits/);
  assert.equal(walletState(w, t0).freeNow, true, "free slot untouched");
  const o = await createOrder(w, "mock"); settleOrder(o.id, true);
  const r = addStone(w, { name: "Yun", wish: "secret hope", sealed: true }, t0);
  assert.equal(r.stone.sealed, 1); assert.equal(r.stone.wish, "secret hope", "owner sees the text");
  assert.equal(r.wallet.credits, PACK.stones - 1, "free stone + one credit for the seal");
  assert.equal(recent(5).at(-1).wish, null, "public list hides it");
  assert.equal(recent(5).at(-1).sealed, 1);
  assert.equal(stoneById(r.stone.id).wish, null); assert.equal(stoneById(r.stone.id, w.id).wish, "secret hope");
  assert.equal("wallet_id" in recent(5).at(-1), false, "wallet ids never leave the server");
  // paid + sealed = two credits
  const r2 = addStone(w, { wish: "second secret", sealed: true }, t0 + 1000);
  assert.equal(r2.wallet.credits, PACK.stones - 3);
});

test("invitations: a friend's first stone rewards both sides once, never yourself, capped per day", async () => {
  const host = createWallet(), guest = createWallet(), t0 = 7_000_000;
  const code = walletState(host, t0).invite; assert.match(code, /^[a-z2-9]{6}$/); assert.equal(walletState(host, t0).invite, code, "stable");
  assert.equal(S.claimInvite(host, code).ok, false, "not yourself");
  assert.equal(S.claimInvite(guest, "nope00").ok, false);
  assert.equal(S.claimInvite(guest, code).ok, true); assert.equal(walletState(S.walletByToken(guest.token), t0).invited, true);
  assert.equal(S.claimInvite(guest, walletState(createWallet(), t0).invite).ok, false, "first inviter wins");
  const r = addStone(guest, { wish: "came through a friend" }, t0);
  assert.deepEqual(r.invite, { inviter: host.id, credits: S.INVITE_REWARD });
  assert.equal(r.wallet.credits, S.INVITE_REWARD, "guest got the gift on top of the free stone");
  const h = walletState(S.walletByToken(host.token), t0); assert.equal(h.credits, S.INVITE_REWARD); assert.equal(h.invites, 1); assert.equal(h.karma, 1);
  assert.equal(addStone(guest, { wish: "second stone" }, t0 + 86_400_000).invite, null, "only the first stone");
  assert.equal(S.claimInvite(guest, code).ok, false, "too late after a stone");
  const a = S.analytics(30, false, Date.now()); assert.ok(a.invites.invited >= 1 && a.invites.rewarded >= 1);
});

test("top blessed: three most blessed stones of the day, week as fallback, hidden text stays hidden", async () => {
  const t0 = Date.now(), author = createWallet();
  const a = addStone(author, { wish: "top one", private: true }, t0).stone, b = addStone(createWallet(), { wish: "top two" }, t0 + 1).stone;
  for (let i = 0; i < 3; i++) bless(createWallet(), a.id, t0 + i); bless(createWallet(), b.id, t0 + 5);
  const top = S.topBlessed(null, t0 + 10);
  assert.equal(top.range, "day"); assert.equal(top.stones[0].id, a.id); assert.equal(top.stones[0].blessings, 3); assert.equal(top.stones[0].wish, null, "private stays private in the top list");
  assert.ok(top.stones.length <= 3 && top.stones.every((s, i, arr) => !i || arr[i - 1].blessings >= s.blessings), "sorted");
  assert.equal(S.topBlessed(author.id, t0 + 10).stones[0].wish, "top one", "owner sees their text");
  const later = S.topBlessed(null, t0 + 3 * 86_400_000); assert.equal(later.range, "week"); assert.equal(later.stones[0].id, a.id);
});

test("seeder: random visitors at a random cadence, bot-flagged, removable by the operator", async () => {
  const { visitor, nextDelay } = await import("./seed-bank.js");
  for (let i = 0; i < 50; i++) { const v = visitor(); assert.ok(v.wish.length >= 2 && v.wish.length <= 140); assert.ok(typeof v.name === "string"); }
  const ds = Array.from({ length: 200 }, () => nextDelay(8, Date.parse("2026-01-01T12:00:00Z")));
  const mean = ds.reduce((a, b) => a + b, 0) / ds.length; assert.ok(mean > 2 * 60_000 && mean < 15 * 60_000, `mean ${Math.round(mean / 1000)}s`); assert.ok(ds.every((d) => d >= 20_000));
  const stop = S.startSeeder(0); assert.equal(stop, null, "off by default");
  const st = S.addSeedStone({ name: "검증", wish: "a test stone" }); assert.ok(st.id);
  assert.equal(S.removeStone(st.id), true); assert.equal(S.stoneById(st.id) ?? null, null); assert.equal(S.removeStone(st.id), false);
});

test("analytics: unit economics per wisher and per buyer", async () => {
  const w = createWallet(); const t0 = Date.now();
  addStone(w, { wish: "unit economics wish" }, t0);
  const o = await createOrder(w, "mock"); settleOrder(o.id, true);
  const u = S.analytics(30, true, t0 + 1000).unit;
  assert.ok(u.wishers >= 1 && u.buyers >= 1, "a wisher and a buyer in the window");
  assert.ok(u.revenue > 0 && u.arpu > 0 && u.arppu > 0, "revenue is attributed per wisher and per buyer");
  assert.equal(u.split.stakersBps, 5000); assert.ok(u.lifetime.arpu > 0);
  assert.equal(S.analytics(30, false, t0 + 1000).unit, undefined, "operator-only");
});

test("private wish: free, text hidden from others, owner toggles it, can be blessed; sealed stones are closed", async () => {
  const w = createWallet(), other = createWallet();
  const t0 = 6_000_000;
  const r = addStone(w, { name: "Mia", wish: "kept to myself", private: true }, t0);
  assert.equal(r.stone.private, 1); assert.equal(r.stone.wish, "kept to myself", "owner sees the text"); assert.equal(r.stone.mine, 1);
  assert.equal(r.wallet.credits, 0, "privacy costs nothing: the free stone was used, no credit spent");
  assert.equal(stoneById(r.stone.id).wish, null, "others do not"); assert.equal(stoneById(r.stone.id, w.id).wish, "kept to myself");
  assert.equal("mine" in stoneById(r.stone.id), false, "no owner flag in the public shape");
  // toggle: only the owner
  assert.throws(() => S.setVisibility(other, r.stone.id, false), /not_yours/);
  assert.equal(S.setVisibility(w, r.stone.id, false).stone.private, 0); assert.equal(stoneById(r.stone.id).wish, "kept to myself", "shown to everyone now");
  assert.equal(S.setVisibility(w, r.stone.id, true).stone.private, 1); assert.equal(stoneById(r.stone.id).wish, null);
  // a private stone is an ordinary stone: it can be blessed
  assert.equal(bless(other, r.stone.id, t0).stone.blessings, 1);
  // a sealed stone is closed
  const o = await createOrder(w, "mock"); settleOrder(o.id, true);
  const sealed = addStone(w, { wish: "sealed one", sealed: true }, t0 + 1000);
  assert.throws(() => bless(other, sealed.stone.id, t0), /sealed/);
});

test("blessings: free per day then credits, once per stone, never your own, owner is notified", async () => {
  const t0 = 9_000_000;
  const author = createWallet(), fan = createWallet();
  const stones = [];
  for (let i = 0; i < FREE_BLESS_PER_DAY + 1; i++) { const w = createWallet(); stones.push(addStone(w, { wish: `wish ${i}` }, t0).stone); }
  const own = addStone(author, { wish: "mine" }, t0).stone;
  assert.throws(() => bless(author, own.id, t0), /own_stone/);
  assert.throws(() => bless(fan, 999999, t0), /not_found/);
  let last;
  for (let i = 0; i < FREE_BLESS_PER_DAY; i++) { last = bless(fan, stones[i].id, t0 + i); assert.equal(last.free, true); assert.equal(last.stone.blessings, 1); }
  assert.equal(last.wallet.blessFreeLeft, 0);
  assert.throws(() => bless(fan, stones[FREE_BLESS_PER_DAY].id, t0), /need_credits/, "quota used and no credits");
  assert.equal(stoneById(stones[FREE_BLESS_PER_DAY].id).blessings, 0, "rolled back");
  const o = await createOrder(fan, "mock"); settleOrder(o.id, true);
  const paid = bless(fan, stones[FREE_BLESS_PER_DAY].id, t0);
  assert.equal(paid.free, false); assert.equal(paid.wallet.credits, PACK.stones - 1);
  assert.throws(() => bless(fan, stones[0].id, t0), /already_blessed/);
  assert.ok(paid.wallet.blessed.includes(stones[0].id));
  // next day the free quota is back
  assert.equal(walletState(S.walletByToken(fan.token), t0 + 86_400_000).blessFreeLeft, FREE_BLESS_PER_DAY);
  // the owner of a blessed stone is told once
  const fanStone = addStone(fan, { wish: "fan's own" }, t0 + 86_400_000).stone;
  bless(author, fanStone.id, t0 + 86_400_001);
  assert.equal(newBlessings(fan, t0 + 86_400_002), 1); assert.equal(newBlessings(fan, t0 + 86_400_003), 0, "marked seen");
});

test("karma: one per stone placed and per blessing given; tiers from the thresholds", async () => {
  const a = createWallet(), b = createWallet(); const t0 = Date.now();
  assert.equal(walletState(a).karma, 0); assert.equal(walletState(a).tier, 0); assert.equal(walletState(a).nextTier, 1);
  const r = addStone(a, { wish: "first deed" }, t0);
  assert.equal(r.wallet.karma, 1); assert.equal(r.wallet.tier, 1, "Pebble at 1");
  const s2 = addStone(b, { wish: "other" }, t0).stone;
  const bl = bless(a, s2.id, t0); assert.equal(bl.wallet.karma, 2);
  assert.throws(() => bless(a, s2.id, t0), /already_blessed/);
  assert.equal(walletState(S.walletByToken(a.token)).karma, 2, "no karma for a rejected blessing");
  assert.equal(walletState(S.walletByToken(a.token)).karmaUi, true, "everyone sees it unless KARMA_AB=1");
});


after(() => server.close());
