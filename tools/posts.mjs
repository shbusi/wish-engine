#!/usr/bin/env node
// Fill the launch posts (Farcaster + X) with today's live numbers so they can be pasted as-is.
//   node tools/posts.mjs --url https://wish-engine-production.up.railway.app [--bot https://t.me/your_bot] [--repo https://github.com/…]
import { writeFileSync, mkdirSync } from "node:fs";
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const URL_ = arg("url", process.env.X_SITE_URL ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""), BOT = arg("bot", ""), REPO = arg("repo", "");
const m = await fetch(`${URL_}/api/metrics`).then((r) => r.json());
if (!m.totals) { console.error("the site did not answer with metrics:", JSON.stringify(m).slice(0, 200)); process.exit(1); }
const H = (m.towerStones * m.stoneCm / 100).toFixed(2), N = m.days.at(-1)?.stones ?? 0, W = m.totals.wallets, S7 = m.days.slice(-7).reduce((a, d) => a + d.stones, 0);
const last = await fetch(`${URL_}/api/stones?n=1`).then((r) => r.json()).catch(() => ({})); const top = last.stones?.at(-1)?.name || "someone";
const D = process.env.X_DAY0 ? Math.floor((Date.now() - Date.parse(process.env.X_DAY0)) / 86_400_000) + 1 : 1;
const en = {
  farcaster_launch: `Humans have stacked stones to make a wish for thousands of years. We built one tower for all of us, on Base, under the firmament.\n\nStack a stone, make a wish, see it land next to everyone else's. It's ${H} m tall right now and it never stops.\n\nHalf of every stone sold pays stakers in the stablecoin it was bought with. 10% is given away, enforced in the contract.\n\n${URL_}`,
  x_1: `Humans have stacked stones to make a wish for thousands of years. Korea, Tibet, Scotland, the Andes, Hawaii.\n\nWe built one tower for all of us, under the firmament. It's ${H} m right now and it never stops growing.\n\nStack yours → ${URL_}`,
  x_daily: `Day ${D}: the tower is ${H} m. ${N ? `+${N} stones today. ` : ""}${top} stacked the top stone.\n\nStack yours → ${URL_}`,
  investor: `For investors: one tower the whole world stacks, live on Base. ${W} wishers so far, ${S7} stones this week. Every stone sold pays stakers in stablecoins, 10% is given away by contract, and the sale opens only after a month of public numbers.\n\nOverview ${URL_}/investors${BOT ? `\nQuestions and early-supporter contributions: ${BOT}` : ""}`,
};
const ko = {
  farcaster_launch: `돌탑에 돌 하나 얹고 소원 비는 거, 우리만 하는 게 아닙니다. 그래서 궁창 아래, 온 세상이 함께 쌓는 탑을 Base 위에 하나 만들었습니다.\n\n돌을 올리고 소원을 빌면 남들 돌 옆에 내 돌이 올라갑니다. 지금 ${H} m, 계속 올라갑니다.\n\n팔린 돌의 절반은 스테이커에게 같은 스테이블코인으로, 10%는 컨트랙트가 강제로 기부합니다.\n\n${URL_}?lang=ko`,
  x_1: `돌탑에 돌 하나 얹고 소원 비는 거, 우리만 하는 게 아닙니다. 티베트, 스코틀랜드, 안데스, 하와이도 합니다.\n\n그래서 궁창 아래, 온 세상이 함께 쌓는 탑을 하나 만들었습니다. 지금 ${H} m, 계속 올라갑니다.\n\n내 돌 올리기 → ${URL_}?lang=ko`,
  x_daily: `${D}일째: 탑 ${H} m. ${N ? `오늘 +${N}개. ` : ""}맨 위 돌은 ${top}님이 올렸습니다.\n\n내 돌 올리기 → ${URL_}?lang=ko`,
  investor: `투자자께: 온 세상이 함께 쌓는 탑 하나, Base에서 돌아가고 있습니다. 지금까지 ${W}명이 소원을 빌었고 이번 주 돌 ${S7}개. 팔린 돌마다 스테이커에게 스테이블코인으로 분배되고, 10%는 컨트랙트가 기부하며, 세일은 지표를 한 달 공개한 뒤에만 엽니다.\n\n소개 ${URL_}/investors?lang=ko${BOT ? `\n질문과 초기 후원: ${BOT}` : ""}`,
};
const md = `# Posts · ${new Date().toISOString().slice(0, 10)} · ${H} m · ${W} wishers · ${S7} stones this week\n\n` + Object.entries({ en, ko }).map(([l, P]) => Object.entries(P).map(([k, v]) => `## ${l} · ${k}\n\n${v}\n`).join("\n")).join("\n");
mkdirSync("out", { recursive: true }); writeFileSync("out/posts.md", md); console.log(md);
