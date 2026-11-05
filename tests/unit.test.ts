import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANNELS, CHANNEL_MAP } from "../src/lib/channels";
import { LOCALES, negotiateLocale, t } from "../src/lib/i18n";
import { isValidOffering, toApiAmount } from "../src/lib/money";
import { sanitizeWish, violates } from "../src/lib/moderation";

test("every channel is fully localized", () => {
  for (const c of CHANNELS) {
    for (const l of LOCALES) {
      assert.ok(c.name[l], `${c.id} name ${l}`);
      assert.ok(c.action[l], `${c.id} action ${l}`);
      assert.ok(c.description[l].length > 20, `${c.id} description ${l}`);
      assert.ok(c.unit[l], `${c.id} unit ${l}`);
    }
  }
  assert.equal(new Set(CHANNELS.map((c) => c.id)).size, CHANNELS.length, "ids unique");
  assert.equal(Object.keys(CHANNEL_MAP).length, CHANNELS.length);
});

test("dictionaries have the same keys in every locale", () => {
  const keys = (o: object) => JSON.stringify(Object.keys(o).sort());
  const base = t("en");
  for (const l of LOCALES) {
    const d = t(l);
    assert.equal(keys(d), keys(base), l);
    assert.equal(keys(d.status), keys(base.status));
    assert.equal(keys(d.errors), keys(base.errors));
  }
});

test("locale negotiation", () => {
  assert.equal(negotiateLocale("ko-KR,ko;q=0.9,en;q=0.8"), "ko");
  assert.equal(negotiateLocale("fr-FR,fr;q=0.9"), "en");
  assert.equal(negotiateLocale("zh-TW"), "zh");
  assert.equal(negotiateLocale(null), "en");
});

test("offering validation: multiples of ₩100 within bounds", () => {
  assert.ok(isValidOffering(100));
  assert.ok(isValidOffering(5000));
  assert.ok(!isValidOffering(50));
  assert.ok(!isValidOffering(150));
  assert.ok(!isValidOffering(0));
  assert.ok(!isValidOffering(1_000_100));
  assert.ok(!isValidOffering("100"));
});

test("api amounts never go below provider minimums", () => {
  assert.equal(toApiAmount("USD", 100), "0.07");
  assert.equal(toApiAmount("USD", 1), "0.01");
  assert.equal(toApiAmount("JPY", 100), "11");
  assert.equal(toApiAmount("KRW", 100), "100");
});

test("moderation", () => {
  assert.equal(sanitizeWish("  hello   world \n"), "hello world");
  assert.ok(violates("visit http://spam.example"));
  assert.ok(violates("call 010-1234-5678"));
  assert.ok(!violates("엄마 건강하세요"));
});
