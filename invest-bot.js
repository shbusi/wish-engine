// Telegram investor bot: answers questions, shows live numbers, registers investors and confirms their USDC
// contributions on Base by watching the treasury wallet. Runs inside server.js when TELEGRAM_BOT_TOKEN is set,
// or standalone: `node invest-bot.js` (same env). Long polling, no webhook, no framework.
//
// Env: TELEGRAM_BOT_TOKEN (BotFather), TELEGRAM_ADMIN_ID (your numeric Telegram id, for /investors and alerts),
//      APP_URL, TREASURY (0x…, where contributions go), CHAIN_RPC_URL (Base), CHAIN_USDC (defaults to Base USDC),
//      INVEST_MIN_USDC (default 50), INVEST_PRICE_USD (default 0.02: the token price early supporters lock in),
//      DB_PATH (the bot keeps its tables in the same SQLite file).
//
// Before the token exists, a contribution is an early-supporter allocation: amount / INVEST_PRICE_USD tokens,
// paid out at the token stage with tools/firmament-airdrop.mjs-style transfers from the sale allocation. The bot
// says so in plain words and keeps the receipt (sender, tx hash, amount) on chain + in the DB.
import { DatabaseSync } from "node:sqlite";
import { ethers } from "ethers";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN, ADMIN = String(process.env.TELEGRAM_ADMIN_ID ?? "");
const API = `https://api.telegram.org/bot${TOKEN}`;
const APP = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TREASURY = process.env.TREASURY ?? "";
const USDC = process.env.CHAIN_USDC ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base mainnet USDC
const MIN = Number(process.env.INVEST_MIN_USDC ?? 50), PRICE = Number(process.env.INVEST_PRICE_USD ?? 0.02);
const SYMBOL = process.env.TOKEN_SYMBOL_HINT ?? "DOL";

const db = new DatabaseSync(process.env.DB_PATH ?? "cairn.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS investors (tg_id TEXT PRIMARY KEY, handle TEXT, address TEXT, lang TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS contributions (tx TEXT PRIMARY KEY, tg_id TEXT, sender TEXT NOT NULL, amount_usdc REAL NOT NULL, block INTEGER NOT NULL, at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS bot_state (k TEXT PRIMARY KEY, v TEXT);
`);
const q = {
  up: db.prepare("INSERT INTO investors (tg_id, handle, address, lang, created_at) VALUES (?, ?, NULL, ?, ?) ON CONFLICT(tg_id) DO UPDATE SET handle = excluded.handle, lang = excluded.lang"),
  setAddr: db.prepare("UPDATE investors SET address = ? WHERE tg_id = ?"),
  byAddr: db.prepare("SELECT * FROM investors WHERE lower(address) = lower(?)"),
  byTg: db.prepare("SELECT * FROM investors WHERE tg_id = ?"),
  addC: db.prepare("INSERT OR IGNORE INTO contributions (tx, tg_id, sender, amount_usdc, block, at) VALUES (?, ?, ?, ?, ?, ?)"),
  mine: db.prepare("SELECT * FROM contributions WHERE tg_id = ? ORDER BY at"),
  all: db.prepare("SELECT c.*, i.handle FROM contributions c LEFT JOIN investors i ON i.tg_id = c.tg_id ORDER BY c.at DESC LIMIT 50"),
  total: db.prepare("SELECT COALESCE(SUM(amount_usdc), 0) AS usd, COUNT(DISTINCT sender) AS n FROM contributions"),
  getS: db.prepare("SELECT v FROM bot_state WHERE k = ?"), setS: db.prepare("INSERT OR REPLACE INTO bot_state (k, v) VALUES (?, ?)"),
};
const fmt = (v, d = 2) => Number(v).toLocaleString("en-US", { maximumFractionDigits: d });

// ---------- copy (en / ko by the user's Telegram language) ----------
const T = {
  en: {
    start: (h) => `Hi${h ? ` ${h}` : ""}. I'm the Wish Cairn investor desk.\n\n🪨 One stone tower the whole world stacks, under the firmament. Every stone sold pays stakers in the stablecoin it was bought with; 10% is given away, enforced in the contract.\n\n/stats · live numbers\n/how · how investing works right now\n/wallet 0x… · register the wallet you will send from\n/invest · the address and the terms\n/mine · your contributions\n/ask <question> · anything else\n\nOverview: ${APP}/investors`,
    stats: (m) => `📊 Tower ${fmt(m.towerStones * m.stoneCm / 100, 2)} m · ${fmt(m.totals.stones)} visitor stones (${fmt(m.last7)} in 7 days) · ${fmt(m.totals.wallets)} wishers · free→paid ${m.totals.stones ? fmt(m.totals.paid / m.totals.stones * 100, 1) : 0}% · pack revenue $${fmt(m.totals.revenueUsd)} · given $${fmt(m.donation?.pledgedUsd ?? 0)}\n\nLive: ${APP}/analytics`,
    how: `How it works right now (stage 1):\n\n• The product is live and the stone contract runs on Base; all stone revenue goes to the treasury.\n• The token (working name ${SYMBOL}) is not deployed yet: its name is being decided and the sale contract goes live after an audit.\n• Until then you can become an **early supporter**: send USDC on Base to the treasury. Your amount locks in the sale price of $${PRICE} per token, and the tokens are transferred to your wallet at the token stage from the sale allocation, same vesting as the public sale (none).\n• Minimum ${MIN} USDC. Below the sale's soft cap the public sale refunds; early-supporter contributions are refundable on request until the token stage.\n• Everything is on chain: your transfer, the treasury wallet, and later the token transfer.\n\nThis is not advice, and tokens can go to zero. Read ${APP}/investors first.`,
    needWallet: "First register the wallet you will send from: /wallet 0xYourAddress (the address, never a seed phrase).",
    badWallet: "That is not a valid EVM address. It looks like 0x followed by 40 hex characters.",
    walletOk: (a) => `Registered ${a}. Send USDC on Base from this address and I will confirm it here.`,
    invest: (a) => `Send USDC on the **Base** network to:\n\n\`${TREASURY}\`\n\nFrom your registered wallet ${a}. Minimum ${MIN} USDC. Terms: /how.\n\nI watch this address and reply within a minute of the transfer confirming. If you send from another wallet, register it with /wallet first or tell me the tx hash with /tx 0x…`,
    noTreasury: "The treasury address is not configured yet. Try again later.",
    confirmed: (amt, tx, tokens) => `✅ Received ${fmt(amt)} USDC. Tx ${tx.slice(0, 10)}… · locked allocation: ${fmt(tokens, 0)} ${SYMBOL} at $${PRICE}. Thank you. /mine shows your receipts.`,
    mine: (rows, total, tokens) => rows.length ? `Your contributions:\n${rows.map((r) => `• ${fmt(r.amount_usdc)} USDC · ${new Date(r.at).toISOString().slice(0, 10)} · ${r.tx.slice(0, 10)}…`).join("\n")}\n\nTotal ${fmt(total)} USDC → ${fmt(tokens, 0)} ${SYMBOL} at the token stage.` : "No contributions yet. /invest shows the address.",
    unknownTx: "I can't find a USDC transfer to the treasury in that transaction yet. If it was sent in the last minute, give it a moment.",
    faq: `Common questions:\n\n• Why Base? Transactions cost less than a cent, USDC/EURC are native, MetaMask and Coinbase users can pay directly.\n• Is it audited? The stone contract is live but holds no funds (revenue is forwarded in the same transaction). The sale and staking contracts go live only after an audit.\n• Where do my tokens come from? From the 25% sale allocation, at the same price as the public sale.\n• Can I get my money back? Yes, on request until the token stage; after that the public-sale refund rule applies.\n• Who are you? A solo founder in Korea; everything is open source: ${APP}/investors\n\nAsk anything else with /ask.`,
    ask: (qst) => `I've passed this to the founder: "${qst.slice(0, 200)}". You'll get an answer here.`,
    adminOnly: "Operator only.",
    investors: (rows, t) => `Contributions: ${fmt(t.usd)} USDC from ${t.n} wallet(s)\n${rows.map((r) => `• ${fmt(r.amount_usdc)} · ${r.sender.slice(0, 8)}… · ${r.handle ? "@" + r.handle : "unlinked"} · ${r.tx.slice(0, 8)}…`).join("\n") || "—"}`,
  },
  ko: {
    start: (h) => `안녕하세요${h ? ` ${h}님` : ""}. Wish Cairn 투자 창구입니다.\n\n🪨 궁창 아래, 온 세상이 함께 쌓는 돌탑 하나. 팔린 돌마다 그 스테이블코인 그대로 스테이커에게 분배되고, 10%는 컨트랙트가 강제로 기부합니다.\n\n/stats · 실시간 숫자\n/how · 지금 투자가 어떻게 되는지\n/wallet 0x… · 보낼 지갑 등록\n/invest · 주소와 조건\n/mine · 내 기여 내역\n/ask <질문> · 그 밖의 질문\n\n소개: ${APP}/investors?lang=ko`,
    stats: (m) => `📊 탑 ${fmt(m.towerStones * m.stoneCm / 100, 2)} m · 방문자 돌 ${fmt(m.totals.stones)}개(7일 ${fmt(m.last7)}개) · 소원자 ${fmt(m.totals.wallets)}명 · 무료→유료 ${m.totals.stones ? fmt(m.totals.paid / m.totals.stones * 100, 1) : 0}% · 팩 매출 $${fmt(m.totals.revenueUsd)} · 기부 $${fmt(m.donation?.pledgedUsd ?? 0)}\n\n실시간: ${APP}/analytics?lang=ko`,
    how: `지금(1단계)은 이렇게 됩니다:\n\n• 제품은 운영 중이고 돌 컨트랙트가 Base에서 돌아갑니다. 돌 매출은 전부 트레저리로 갑니다.\n• 토큰(임시명 ${SYMBOL})은 아직 배포 전입니다. 이름을 정하는 중이고, 세일 컨트랙트는 감사 뒤에 올라갑니다.\n• 그때까지는 **초기 후원자**로 참여할 수 있습니다. Base의 USDC를 트레저리로 보내면, 그 금액이 세일 가격 $${PRICE}/토큰으로 고정되고 토큰 단계에서 세일 물량에서 지갑으로 전송됩니다(공개 세일과 같은 조건, 베스팅 없음).\n• 최소 ${MIN} USDC. 공개 세일은 소프트캡 미달 시 환불되고, 초기 후원금은 토큰 단계 전까지 요청하면 환불됩니다.\n• 송금, 트레저리 지갑, 나중의 토큰 전송까지 전부 온체인입니다.\n\n투자 조언이 아니며 토큰 가치는 0이 될 수 있습니다. 먼저 ${APP}/investors?lang=ko 를 읽어 주세요.`,
    needWallet: "먼저 보낼 지갑을 등록하세요: /wallet 0x주소 (주소만, 시드 구문은 절대 보내지 마세요).",
    badWallet: "올바른 EVM 주소가 아닙니다. 0x 뒤에 40자리 16진수입니다.",
    walletOk: (a) => `${a} 등록했습니다. 이 주소에서 Base USDC를 보내면 여기서 확인해 드립니다.`,
    invest: (a) => `**Base** 네트워크의 USDC를 아래 주소로 보내세요:\n\n\`${TREASURY}\`\n\n등록한 지갑 ${a}에서 보내 주세요. 최소 ${MIN} USDC. 조건은 /how.\n\n이 주소를 지켜보다가 전송이 확정되면 1분 안에 답합니다. 다른 지갑에서 보냈다면 /wallet로 먼저 등록하거나 /tx 0x… 로 해시를 알려주세요.`,
    noTreasury: "트레저리 주소가 아직 설정되지 않았습니다. 잠시 뒤 다시 시도해 주세요.",
    confirmed: (amt, tx, tokens) => `✅ ${fmt(amt)} USDC 받았습니다. Tx ${tx.slice(0, 10)}… · 확정 배정: $${PRICE}에 ${fmt(tokens, 0)} ${SYMBOL}. 감사합니다. /mine 에서 영수증을 볼 수 있습니다.`,
    mine: (rows, total, tokens) => rows.length ? `내 기여:\n${rows.map((r) => `• ${fmt(r.amount_usdc)} USDC · ${new Date(r.at).toISOString().slice(0, 10)} · ${r.tx.slice(0, 10)}…`).join("\n")}\n\n합계 ${fmt(total)} USDC → 토큰 단계에 ${fmt(tokens, 0)} ${SYMBOL}.` : "아직 기여가 없습니다. /invest 에 주소가 있습니다.",
    unknownTx: "그 트랜잭션에서 트레저리로 간 USDC 전송을 아직 못 찾았습니다. 방금 보냈다면 잠시 기다려 주세요.",
    faq: `자주 묻는 질문:\n\n• 왜 Base? 거래 수수료가 1센트 미만이고 USDC·EURC가 기본 발행돼 메타마스크·코인베이스 사용자가 바로 결제합니다.\n• 감사는? 돌 컨트랙트는 돈을 쥐지 않고 같은 트랜잭션에서 넘깁니다. 돈을 쥐는 세일·스테이킹 컨트랙트는 감사 뒤에만 올립니다.\n• 내 토큰은 어디서? 세일 물량 25%에서, 공개 세일과 같은 가격으로.\n• 환불은? 토큰 단계 전까지 요청하면 됩니다. 그 뒤엔 공개 세일 환불 규칙을 따릅니다.\n• 누구인가? 한국의 1인 창업자이고 전부 오픈소스입니다: ${APP}/investors?lang=ko\n\n다른 질문은 /ask 로.`,
    ask: (qst) => `창업자에게 전달했습니다: "${qst.slice(0, 200)}". 여기로 답이 옵니다.`,
    adminOnly: "운영자만 쓸 수 있습니다.",
    investors: (rows, t) => `기여: ${t.n}개 지갑에서 ${fmt(t.usd)} USDC\n${rows.map((r) => `• ${fmt(r.amount_usdc)} · ${r.sender.slice(0, 8)}… · ${r.handle ? "@" + r.handle : "미연결"} · ${r.tx.slice(0, 8)}…`).join("\n") || "—"}`,
  },
};
const L = (u) => (String(u?.language_code ?? "").startsWith("ko") ? "ko" : "en");

// ---------- telegram ----------
async function tg(method, body) {
  if (!TOKEN) return null; // dry: no Telegram configured (tests, local runs)
  const r = await fetch(`${API}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!j.ok) console.error("telegram", method, j.description ?? r.status); return j.result;
}
const say = (chat, text) => tg("sendMessage", { chat_id: chat, text, parse_mode: "Markdown", disable_web_page_preview: true });

async function metrics() { const m = await fetch(`${APP}/api/metrics`).then((r) => r.json()); m.last7 = m.days.slice(-7).reduce((a, d) => a + d.stones, 0); return m; }

export async function handle(msg, reply = say) {
  const chat = msg.chat.id, u = msg.from, id = String(u.id), lang = L(u), t = T[lang], text = String(msg.text ?? "").trim();
  if (!text.startsWith("/")) return reply(chat, t.faq);
  const [cmd, ...rest] = text.split(/\s+/); const arg = rest.join(" ");
  q.up.run(id, u.username ?? null, lang, Date.now());
  switch (cmd.replace(/@.*$/, "")) {
    case "/start": return reply(chat, t.start(u.first_name));
    case "/stats": try { return reply(chat, t.stats(await metrics())); } catch { return reply(chat, "…"); }
    case "/how": return reply(chat, t.how);
    case "/faq": return reply(chat, t.faq);
    case "/wallet": { if (!ethers.isAddress(arg)) return reply(chat, t.badWallet); const a = ethers.getAddress(arg); q.setAddr.run(a, id); return reply(chat, t.walletOk(a)); }
    case "/invest": { if (!TREASURY) return reply(chat, t.noTreasury); const inv = q.byTg.get(id); if (!inv?.address) return reply(chat, t.needWallet); return reply(chat, t.invest(inv.address)); }
    case "/mine": { const rows = q.mine.all(id); const total = rows.reduce((a, r) => a + r.amount_usdc, 0); return reply(chat, t.mine(rows, total, total / PRICE)); }
    case "/tx": { const found = await checkTx(arg, id); return found ? reply(chat, t.confirmed(found.amount, found.tx, found.amount / PRICE)) : reply(chat, t.unknownTx); }
    case "/ask": { if (ADMIN) await say(ADMIN, `❓ @${u.username ?? id} (${lang}): ${arg}`); return reply(chat, t.ask(arg)); }
    case "/investors": { if (id !== ADMIN) return reply(chat, t.adminOnly); return reply(chat, t.investors(q.all.all(), q.total.get())); }
    default: return reply(chat, t.faq);
  }
}

// ---------- chain watcher: USDC transfers into the treasury ----------
let provider = null, usdc = null;
const chainReady = () => { if (!process.env.CHAIN_RPC_URL || !TREASURY) return false; provider ??= new ethers.JsonRpcProvider(process.env.CHAIN_RPC_URL, undefined, { staticNetwork: true }); usdc ??= new ethers.Contract(USDC, ["event Transfer(address indexed from, address indexed to, uint256 value)"], provider); return true; };
async function record(ev, block, at) {
  const sender = ev.args.from, amount = Number(ethers.formatUnits(ev.args.value, 6));
  const inv = q.byAddr.get(sender); const tgId = inv?.tg_id ?? null;
  if (q.addC.run(ev.transactionHash, tgId, sender, amount, block, at).changes === 0) return null;
  if (tgId && amount >= MIN) await say(tgId, T[inv.lang === "ko" ? "ko" : "en"].confirmed(amount, ev.transactionHash, amount / PRICE));
  if (ADMIN) await say(ADMIN, `💵 ${fmt(amount)} USDC from ${sender.slice(0, 10)}… ${tgId ? "(@" + (inv.handle ?? tgId) + ")" : "(unlinked wallet)"} · ${ev.transactionHash}`);
  return { amount, tx: ev.transactionHash };
}
export async function checkTx(hash, tgId) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash ?? "") || !chainReady()) return null;
  const rc = await provider.getTransactionReceipt(hash).catch(() => null); if (!rc) return null;
  for (const log of rc.logs) { try { const ev = usdc.interface.parseLog(log); if (log.address.toLowerCase() === USDC.toLowerCase() && ev?.name === "Transfer" && ev.args.to.toLowerCase() === TREASURY.toLowerCase()) { const b = await provider.getBlock(rc.blockNumber); const r = await record({ args: ev.args, transactionHash: hash }, rc.blockNumber, (b?.timestamp ?? 0) * 1000); if (r) return r; const c = db.prepare("SELECT amount_usdc AS amount, tx FROM contributions WHERE tx = ?").get(hash); if (c && tgId) { db.prepare("UPDATE contributions SET tg_id = COALESCE(tg_id, ?) WHERE tx = ?").run(tgId, hash); return c; } } } catch {} }
  return null;
}
export async function watch() {
  if (!chainReady()) return;
  try {
    const latest = await provider.getBlockNumber(); const from = Math.max(0, Number(q.getS.get("block")?.v ?? latest - 2000));
    for (let a = from; a <= latest; a += 2000) { const to = Math.min(latest, a + 1999); const evs = await usdc.queryFilter(usdc.filters.Transfer(null, TREASURY), a, to); for (const ev of evs) { const b = await provider.getBlock(ev.blockNumber); await record(ev, ev.blockNumber, (b?.timestamp ?? 0) * 1000); } }
    q.setS.run("block", String(latest + 1));
  } catch (e) { console.error("invest-bot watch:", e.message?.slice(0, 120)); }
}

// ---------- long polling ----------
export function start() {
  if (!TOKEN) return false;
  let offset = Number(q.getS.get("offset")?.v ?? 0);
  (async function loop() {
    for (;;) {
      try {
        const updates = await fetch(`${API}/getUpdates?timeout=50&offset=${offset}`, { signal: AbortSignal.timeout(60_000) }).then((r) => r.json());
        for (const u of updates.result ?? []) { offset = u.update_id + 1; q.setS.run("offset", String(offset)); if (u.message?.text) handle(u.message).catch((e) => console.error("invest-bot:", e.message)); }
      } catch (e) { if (!/timeout|aborted/i.test(e.message)) console.error("invest-bot poll:", e.message?.slice(0, 120)); await new Promise((r) => setTimeout(r, 3000)); }
    }
  })();
  setInterval(watch, 30_000).unref(); watch();
  console.log(`invest bot: polling telegram · treasury ${TREASURY || "(unset)"} · watching ${process.env.CHAIN_RPC_URL ? "Base USDC" : "nothing (CHAIN_RPC_URL unset)"}`);
  return true;
}
if (process.argv[1] && process.argv[1].endsWith("invest-bot.js")) { if (!start()) { console.error("TELEGRAM_BOT_TOKEN is not set"); process.exit(1); } }
