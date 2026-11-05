import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DB_PATH = ":memory:";
const { addStone, count, recent, after: afterId, server } = await import("./server.js");

test("stones: validation, order, pagination", () => {
  assert.throws(() => addStone({ wish: "x" }), /too_short/);
  assert.throws(() => addStone({ wish: "a".repeat(141) }), /too_long/);
  assert.throws(() => addStone({ wish: "visit http://spam.io" }), /rejected/);
  const a = addStone({ name: "  민준 ", wish: "  엄마   건강  " });
  assert.equal(a.name, "민준");
  assert.equal(a.wish, "엄마 건강");
  const b = addStone({ wish: "취업" });
  assert.equal(b.name, null);
  assert.equal(count(), 2);
  assert.deepEqual(recent(10).map((s) => s.id), [a.id, b.id], "oldest → newest");
  assert.deepEqual(afterId(a.id).map((s) => s.id), [b.id]);
});

test("http: post → list → sse", async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const base = `http://localhost:${port}`;
  const sse = await fetch(`${base}/api/events`);
  const reader = sse.body.getReader();
  const dec = new TextDecoder();
  let buf = dec.decode((await reader.read()).value);
  assert.match(buf, /"type":"hello"/);

  const r = await fetch(`${base}/api/stones`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wish: "함께 빌어요", name: "서연" }) });
  assert.equal(r.status, 201);
  const j = await r.json();
  assert.equal(j.stone.name, "서연");

  for (let i = 0; i < 5 && !buf.includes('"type":"stone"'); i++) buf += dec.decode((await reader.read()).value);
  assert.match(buf, /"type":"stone".*함께 빌어요/);

  const list = await fetch(`${base}/api/stones`).then((r) => r.json());
  assert.equal(list.total, 3);
  assert.equal(list.stones.at(-1).wish, "함께 빌어요");
  const html = await fetch(`${base}/`).then((r) => r.text());
  assert.match(html, /소원 돌탑/);
  await reader.cancel();
});

after(() => server.close());
