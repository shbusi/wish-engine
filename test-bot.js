import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DB_PATH = ":memory:"; process.env.TREASURY = "0xB6E0915c8CEe08d49D60761E30E7691bE42a6C6f"; process.env.APP_URL = "http://localhost:3999";
process.env.TELEGRAM_ADMIN_ID = "42";
const { handle } = await import("./invest-bot.js");

const msg = (text, id = 7, lang = "en") => ({ chat: { id }, from: { id, username: "alice", first_name: "Alice", language_code: lang }, text });
async function run(text, id, lang) { const out = []; await handle(msg(text, id, lang), async (_chat, t) => out.push(t)); return out.join("\n"); }

test("investor bot: start, how, wallet registration, invest address, receipts, language", async () => {
  assert.match(await run("/start"), /investor desk/);
  assert.match(await run("/start", 8, "ko"), /투자 창구/);
  assert.match(await run("/how"), /early supporter/);
  assert.match(await run("/invest"), /register the wallet/, "needs a wallet first");
  assert.match(await run("/wallet notanaddress"), /not a valid/);
  assert.match(await run("/wallet 0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"), /Registered 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC/, "checksummed");
  assert.match(await run("/invest"), /0xB6E0915c8CEe08d49D60761E30E7691bE42a6C6f/);
  assert.match(await run("/mine"), /No contributions yet/);
  assert.match(await run("/investors"), /Operator only/);
  assert.match(await run("/investors", 42), /Contributions: 0 USDC/);
  assert.match(await run("hello there"), /Common questions/);
  assert.match(await run("/tx 0xnothex"), /can't find/);
});
