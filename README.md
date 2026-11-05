# 소원 돌탑 · Wish Cairn

모두가 함께 쌓는 돌탑 하나. 소원을 적고 돌을 올리면, 지금 보고 있는 모든 사람의 화면에 그 돌이 실시간으로 올라갑니다.

One shared stone tower. Write a wish, stack a stone, and everyone watching sees it land.

## Run

```bash
node server.js          # http://localhost:3000  (Node ≥ 22.13, no npm install needed)
npm test
```

- `PORT` (default 3000), `DB_PATH` (default `cairn.db`, SQLite via `node:sqlite`), `RATE_PER_MIN` (stones per minute per IP, default 5)
- Put it behind any reverse proxy; SSE needs buffering off (`X-Accel-Buffering: no` is sent).

## What it is

- `server.js` — 150 lines: SQLite table of stones, `GET/POST /api/stones`, `GET /api/events` (SSE), 5 stones/min/IP.
- `index.html` — the tower (SVG, newest 16 stones with names inscribed, older ones become the base mound), the form, the live feed. Korean/English by browser language.

That's all of it. No accounts, no payments, no build step.

## Later, if wanted

- ₩100 offering per stone (PayPal / crypto) — add a payment step before `POST /api/stones`.
- Several towers (one per culture: ema, lanterns, coins) — one more column, one more scene.
- A nightly moment when everyone stacks at the same time — a countdown and the same SSE channel.
