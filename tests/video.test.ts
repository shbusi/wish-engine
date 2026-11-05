import { test } from "node:test";
import assert from "node:assert/strict";
import { frameAt, FRAME_COUNT, VIDEO, timeOfFrame, easeOutBounce, easeOutBack } from "../src/lib/video-timeline";
import { objectSprite, channelArt } from "../src/lib/art";

test("timeline: object waits, drops, settles exactly at rest, then reveals", () => {
  const o = { rare: true, rises: false, count: 12 };
  const start = frameAt(0, o);
  assert.equal(start.objectY, -1100, "off-screen above");
  assert.equal(start.objectOpacity, 0);
  assert.equal(start.badge, 0);
  const mid = frameAt(1.5, o);
  assert.ok(mid.objectY > -1100 && mid.objectY < 0, "falling");
  const rest = frameAt(2.2, o);
  assert.ok(Math.abs(rest.objectY) < 1, "at rest");
  assert.equal(rest.objectScale, 1);
  const impact = frameAt(2.4, o);
  assert.ok(impact.flash > 0 && impact.ring > 0 && impact.ring < 1, "impact flash + ring");
  const end = frameAt(VIDEO.seconds, o);
  assert.equal(end.flash, 0);
  assert.equal(end.border, 1);
  assert.ok(Math.abs(end.badge - 1) < 1e-9);
  assert.equal(end.cta, 1);
  assert.equal(end.counter, 12);
  assert.equal(end.name, 1);
});

test("timeline: common wish has no rarity reveal; lanterns rise from below", () => {
  const end = frameAt(VIDEO.seconds, { rare: false, rises: false, count: 3 });
  assert.equal(end.border, 0);
  assert.equal(end.badge, 0);
  assert.ok(end.flash === 0);
  const l = frameAt(0, { rare: false, rises: true, count: 3 });
  assert.equal(l.objectY, 900, "below the frame");
  assert.ok(Math.abs(frameAt(2.2, { rare: false, rises: true, count: 3 }).objectY) < 1);
});

test("frame count and easing bounds", () => {
  assert.equal(FRAME_COUNT, 96);
  assert.equal(timeOfFrame(FRAME_COUNT - 1) < VIDEO.seconds, true);
  assert.equal(easeOutBounce(1), 1);
  assert.equal(easeOutBounce(0), 0);
  assert.ok(easeOutBack(0.6) > 1, "overshoots");
  assert.ok(Math.abs(easeOutBack(1) - 1) < 1e-9);
});

test("art manifest falls back cleanly when empty", () => {
  assert.equal(channelArt("stone-cairn"), undefined);
  assert.equal(objectSprite("stone-cairn", "RARE"), undefined);
});
