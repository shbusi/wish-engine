import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DB_PATH = ":memory:";
process.env.PAYMENT_PROVIDERS = "mock";
process.env.RATE_PER_MIN = "100";
process.env.ADMIN_TOKEN = "test-admin";
const S = await import("./server.js");
const Soil = await import("./soil.js");
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

test("seed: planted with the first stone; grows with daily water and weather; dies when neglected in a dry spell; mulch stops frost; data-driven fits", () => {
  const { waterSeed, mulchSeed, replantSeed } = S; const { simulate, soilAt, SPECIES } = Soil;
  const DAY = 86_400_000, t0 = Date.now(), today = Math.floor(t0 / DAY);
  const w = createWallet(); assert.equal(walletState(w).seed, null);
  addStone(w, { name: "Mira", wish: "grow" }, t0);
  let sd = walletState(S.walletByToken(w.token), t0).seed;
  assert.equal(sd.kind, "wildflower"); assert.equal(sd.waterings, 1); assert.equal(sd.canWater, false); assert.ok(Soil.inGarden(sd.x, sd.z)); assert.ok(sd.weather && sd.tomorrow, "weather comes with the state");
  assert.throws(() => waterSeed(w, t0 + 1000), /watered_today/);
  const r1 = waterSeed(w, t0 + DAY); assert.equal(r1.seed.waterings, 2); assert.equal(r1.wallet.karma, 2, "watering is a deed");
  // the simulation with a controlled climate: warm, dry, no rain → an unwatered black-eyed Susan dies of drought
  const warmDry = (d) => ({ day: d, doy: 180, month: 6, tmean: 26, tmin: 19, tmax: 32, rain: 0, cond: "dry", dryStreak: 9 });
  const dead = simulate({ plantedDay: 0, kind: "wildflower", soil: "meadow", waters: [0], mulches: [] }, 30, warmDry);
  assert.equal(dead.alive, false); assert.equal(dead.cause, "drought"); assert.ok(dead.diedOn > 0 && dead.diedOn < 30);
  const cared = simulate({ plantedDay: 0, kind: "wildflower", soil: "meadow", waters: Array.from({ length: 31 }, (_, i) => i), mulches: [] }, 30, warmDry);
  assert.equal(cared.alive, true); assert.equal(cared.stage, 5, "daily water in summer → in bloom");
  // frost on a seedling: mulch is the difference
  const frosty = (d) => ({ day: d, doy: 60, month: 2, tmean: 4, tmin: -6, tmax: 11, rain: 0, cond: "frost", dryStreak: 0 });
  const mild = (d) => ({ day: d, doy: 100, month: 3, tmean: 14, tmin: 7, tmax: 21, rain: 0, cond: "clear", dryStreak: 0 });
  const wx = (d) => (d < 2 ? mild(d) : frosty(d)); // two mild days: a seedling, then a cold snap
  const unprotected = simulate({ plantedDay: 0, kind: "wildflower", soil: "meadow", waters: Array.from({ length: 12 }, (_, i) => i), mulches: [] }, 6, wx);
  const protectedP = simulate({ plantedDay: 0, kind: "wildflower", soil: "meadow", waters: Array.from({ length: 12 }, (_, i) => i), mulches: [2] }, 6, wx); // mulched the day the cold snap starts
  assert.ok(unprotected.health < protectedP.health, "mulch shields the seedling"); assert.equal(unprotected.alive, false, "five frost nights kill an unmulched seedling");
  assert.equal(protectedP.alive, true); assert.ok(protectedP.stress.includes("frostMulched"));
  assert.equal(simulate({ plantedDay: 0, kind: "wildflower", soil: "meadow", waters: Array.from({ length: 12 }, (_, i) => i), mulches: [2] }, 11, wx).alive, false, "a mulch lasts five days; the cold goes on");
  // USDA traits decide fits: white pine needs cold stratification; the lotus never blooms off wet ground; witch-hazel blooms in fall only
  assert.deepEqual(simulate({ plantedDay: 0, kind: "pine", soil: "rocky", waters: [0], mulches: [] }, 3, warmDry).stress, ["strat"]);
  const lot = simulate({ plantedDay: 0, kind: "lotus", soil: "meadow", waters: Array.from({ length: 60 }, (_, i) => i), mulches: [] }, 59, warmDry); assert.equal(lot.stage, 4); assert.ok(lot.stress.includes("needsWet"));
  const lotWet = simulate({ plantedDay: 0, kind: "lotus", soil: "river", waters: Array.from({ length: 60 }, (_, i) => i), mulches: [] }, 59, warmDry); assert.equal(lotWet.stage, 5, "lotus blooms on the riverbank in midsummer");
  assert.equal(SPECIES.lantern.usda, "HAVI4");
  // server endpoints: mulch once per cover, replant after death keeps the spot rules
  const m1 = mulchSeed(w, t0 + DAY); assert.equal(m1.seed.mulched, true); assert.throws(() => mulchSeed(w, t0 + 2 * DAY), /mulched/);
  const find = (soil) => { for (let a = 0; a < 6.28; a += 0.05) for (let r = 4; r < 11.9; r += 0.5) { const x = Math.cos(a) * r, z = Math.sin(a) * r; if (soilAt(x, z) === soil) return { x, z }; } throw new Error("no " + soil); };
  const river = find("river"); const r2 = replantSeed(w, { ...river, kind: "wildflower" }, t0 + 2 * DAY); assert.equal(r2.seed.soil, "river"); assert.equal(r2.seed.waterings, 1);
  assert.throws(() => replantSeed(w, { ...river, kind: "lantern" }, t0 + 2 * DAY), /seed_locked/);
  assert.throws(() => replantSeed(w, { x: 0, z: 1, kind: "wildflower" }), /bad_spot/);
  const other = createWallet(); addStone(other, { wish: "mine too" }, t0 + 2 * DAY);
  assert.throws(() => replantSeed(other, { ...river, kind: "wildflower" }, t0 + 2 * DAY), /spot_taken/);
  const g = S.seeds(10, t0 + 2 * DAY); assert.ok(g.some((p) => p.name === "Mira" && p.soil === "river" && p.alive === true));
});

after(() => server.close());
