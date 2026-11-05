# Wish Engine

> 인류 공통의 기복 문화를 한 곳에. Every culture's way of asking for a blessing, in one place.

Stone cairns in Korea, ema plaques in Japan, coins in Rome's fountains, sky lanterns over Pingxi,
ribbons on Hong Kong's wishing tree, notes in Jerusalem's wall. Every culture on earth has a ritual
for asking the universe for something. **Wish Engine turns each ritual into a channel.** Pick one,
offer ₩100 (about $0.07) via PayPal or crypto, write your wish. Once payment clears, the wish becomes
part of that channel's living scene.

## Channels (12)

| Channel | Ritual | Origin |
|---|---|---|
| 🪨 Stone Cairn 돌탑 | Stack a stone | Korea · Tibet · Scotland |
| 🪵 Ema 絵馬 | Hang a plaque | Japan |
| 🪙 Wishing Fountain | Toss a coin | Rome · worldwide |
| 🏮 Sky Lantern 天燈 | Release a lantern | Taiwan · Thailand · China |
| 🎀 Wishing Tree 許願樹 | Tie a ribbon | Hong Kong · Türkiye · Ireland |
| 🧱 Wall of Notes | Slip a note into the wall | Jerusalem · worldwide |
| 🕯️ Votive Candle | Light a candle | Europe · Latin America · worldwide |
| 🪷 Krathong | Float a krathong | Thailand · Laos |
| 🧵 Bonfim Ribbon | Tie three knots | Brazil |
| 🏳️ Prayer Flag | Hang a flag | Tibet · Nepal · Bhutan |
| 🪔 Floating Diya | Float a diya | India · Nepal |
| 🌠 Shooting Star | Wish on a star | Everywhere (secular) |

**Credit packs:** ₩1,000 buys 10 wishes. Credits sit in an anonymous wallet tied to a cookie, with a
recovery code (`WE-XXXXXX-…`) to restore it on another device. A wish paid with a credit skips checkout
and is offered instantly. This is the economically sane path: one PayPal/crypto fee per 10 wishes
instead of per wish.

**Share loop:** every offered wish has a PNG card (`/w/:id/card?f=story|og|square`) with the wisher's
name inscribed on their ritual object, Open Graph metadata for link previews, and a share bar with
native share (PNG attached), X, copy link and downloads. Shared links carry `?s=1`; a wish made after
following one is attributed back ("N people wished after seeing this").

**Drop video:** `/w/:id/video` renders a 4.8s 1080×1920 MP4 of the drop moment (object falls into
place, impact flash, name inscribed, rarity reveal for relics, CTA). Satori lays out each frame,
native resvg rasterizes them in parallel on the libuv threadpool, raw RGBA is piped into ffmpeg, and
the gradient/glow plates are rasterized once and composited by ffmpeg. A 96-frame video takes about
5–10s on 4 cores. Rendered once per wish, cached under `VIDEO_CACHE_DIR`; the share bar polls until
ready. The timeline is pure and tested (`src/lib/video-timeline.ts`).

**Art pipeline:** `public/art/manifest.json` is the seam where generated 2D/3D assets replace the
built-in SVG/CSS rendering per channel. See `docs/ART_DIRECTION.md` for the style bible, model
choices (Flux + LoRA, Kling/Veo for loops, Hunyuan3D for props) and the quality gates.

**Rare drops & auctions:** when a wish is offered a rarity is rolled (Common 94% · Uncommon 5% ·
Rare 0.9% · Legendary 0.1%). Anything above Common mints a **Relic**, a culturally specific variant of
the ritual object (옥돌 Jade Stone, 金箔の絵馬 Gilded Ema, Ancient Roman Coin, Dragon Lantern …) owned
by the wisher's wallet. Owners can put relics up for a 24h/72h **credit auction**: bids lock credits,
outbid credits refund instantly, bids in the last five minutes extend the auction, and on settlement
the relic transfers, the seller receives 80% of the winning bid and 20% is the platform fee. Rare
objects glow in the channel scene and the share card gets a rarity frame.

Each channel is fully localized in **ko / en / ja / zh** and has a data-driven SVG scene that grows
with the number of offered wishes (`src/components/RitualScene.tsx`). Adding a channel is one entry
in `src/lib/channels.ts` plus a `case` in the scene renderer.

## Stack

- **Next.js 15** (App Router, server components) · React 19 · TypeScript · Tailwind v4
- **Prisma 6** — SQLite in dev, switch `provider` to `postgresql` for prod
- **Payments** — pluggable providers behind one interface (`src/lib/payments/`):
  - `mock` — dev/staging only, in-app "mark as paid" page
  - `paypal` — Orders API v2 hosted checkout + capture on return + signed webhooks
  - `crypto` — Coinbase Commerce-style hosted charge + HMAC-signed webhooks (USDC/ETH/BTC…)
- No auth. Wishes are anonymous by design; an optional display name is the only identity.

## Run it

```bash
cp .env.example .env          # defaults: SQLite + mock payments
npm install
npm run db:push               # create schema
npm run db:seed               # create the 12 channel rows
SEED_SAMPLE=1 npm run db:seed # optional: add sample wishes
npm run dev                   # http://localhost:3000
```

Tests (unit + settlement logic against an isolated SQLite db):

```bash
npm test
```

## Wish lifecycle

```
POST /api/wishes  ──▶  Wish(PENDING) + Payment(CREATED)  ──▶  provider hosted checkout
                                                                      │
          webhook / return URL  ◀─────────────────────────────────────┘
                 │
      settlePayment()  ──▶  Payment(PAID) + Wish(OFFERED) + Channel.wishCount++
```

`settlePayment` (`src/lib/wishes.ts`) is idempotent: duplicate webhooks are no-ops, counters move
only on the first transition, refunds reverse the counter. Webhook event ids are recorded in
`WebhookEvent` so replays are ignored. Only `OFFERED` + `isPublic` wishes ever appear on a wall.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/wishes?channel=&cursor=&take=` | Public wall, cursor-paginated |
| `POST` | `/api/wishes` | Create wish + checkout → `{ redirectUrl }` |
| `GET` | `/api/stats` | Totals per channel, today, this week |
| `POST` | `/api/webhooks/paypal` | PayPal events (signature verified) |
| `POST` | `/api/webhooks/crypto` | Crypto events (HMAC verified) |
| `GET` | `/api/paypal/return?p=&token=` | Capture approved PayPal order |
| `GET` | `/api/paypal/cancel?p=` | Buyer cancelled |
| `POST` | `/api/credits/checkout` | Buy a credit pack → `{ redirectUrl }` (mints wallet cookie) |
| `POST` | `/api/credits/claim` | Restore a wallet from its recovery code |
| `GET` | `/w/:id/card?f=story\|og\|square` | PNG share card (1080×1920 / 1200×630 / 1080×1080) |
| `GET` | `/w/:id/video` | 9:16 MP4 of the drop moment; `202 { status, progress }` while rendering, `?status=1` to poll |
| `POST` | `/api/wishes/:id/share` | Count a share click |
| `POST` | `/api/auctions` | List a relic you own `{ relicId, hours: 24\|72, minBidCredits? }` |
| `POST` | `/api/auctions/:id/bid` | Bid credits `{ credits }` (402 when short) |
| `POST` | `/api/auctions/:id/cancel` | Cancel an unbid auction (seller) |
| `GET` | `/api/auctions/settle` | Cron target; settles due auctions (also lazy on page views). `Authorization: Bearer $CRON_SECRET` when set |
| `POST` | `/api/mock/confirm` | Dev only: simulate outcome |
| `GET` | `/api/locale?set=ko&back=/` | Set language cookie |

Request body for `POST /api/wishes`:

```json
{ "channelId": "stone-cairn", "text": "…", "author": "optional", "locale": "ko",
  "isPublic": true, "amountKrw": 100, "provider": "paypal" }
```

With `"provider": "credits"` the wallet in the cookie is debited one credit atomically and the wish is
offered immediately (`402 insufficient_credits` otherwise).

Validation: 2–280 chars, offering is a multiple of ₩100 up to ₩1,000,000, URLs / phone numbers /
handles rejected, 10 requests per minute per IP (in-memory; use Redis for multi-instance).

## Going live

1. `PAYMENT_PROVIDERS="paypal,crypto"` and fill the provider keys in `.env`.
   The mock provider is automatically disabled when `NODE_ENV=production`
   (set `ALLOW_MOCK_PAYMENTS=1` only on staging).
2. Register webhooks:
   - PayPal → `https://<host>/api/webhooks/paypal`, events `PAYMENT.CAPTURE.*`; put the webhook id in `PAYPAL_WEBHOOK_ID`.
   - Crypto → `https://<host>/api/webhooks/crypto`; shared secret in `CRYPTO_WEBHOOK_SECRET`.
3. Switch Prisma to Postgres (`provider = "postgresql"`), run `prisma migrate deploy`.
4. Set `NEXT_PUBLIC_APP_URL` to the public origin (used for return URLs and share links).
5. Replace the static FX rates in `.env` with a live feed if you price in USD at scale.
6. Point a cron at `GET /api/auctions/settle` every few minutes (set `CRON_SECRET`). Pages also settle
   lazily, so this is a safety net, not a requirement.
7. Rarity odds are env-tunable (`RARITY_LEGENDARY_BP`, `RARITY_RARE_BP`, `RARITY_UNCOMMON_BP`, basis
   points of 10,000) for events. `RARITY_FORCE=RARE` works outside production (or on staging with `ALLOW_MOCK_PAYMENTS=1`) for testing.
8. Videos need ffmpeg (`ffmpeg-static` is bundled; override with `FFMPEG_PATH`) and a long-running
   Node process (a render takes 5–10s; `VIDEO_RASTER_PARALLEL` defaults to 4, match it to cores). On serverless hosts move `src/lib/video.tsx` to a worker and
   point `VIDEO_CACHE_DIR` at shared storage. `VIDEO_MAX_CONCURRENT` caps parallel renders.
9. Share cards fetch per-text font subsets from Google Fonts at render time (cached in memory); allow
   `fonts.googleapis.com` and `fonts.gstatic.com` egress.

### ⚠️ The ₩100 economics

A ₩100 offering is ≈ $0.07. PayPal's standard fixed fee alone (~$0.49) is seven times that, and
on-chain gas on most L1s is worse. The product idea survives this only if:

- **PayPal Micropayments** pricing (5% + $0.05) is enabled on the merchant account, and/or
- users are nudged toward ₩1,000+ offerings (the form offers ₩100 / 500 / 1,000 / 5,000 presets), and/or
- crypto runs on an L2 or a near-zero-fee chain (Base, Polygon, Solana USDC) via the hosted provider.

₩100 should be read as the *symbolic minimum*, not the expected average ticket. The ₩1,000 / 10-wish
credit pack (`/credits`) is the default path to push users toward; the single ₩100 checkout stays for
the "I just want to toss one coin" moment.

## Project layout

```
prisma/schema.prisma       Channel · Wish · Payment · WebhookEvent · CreditWallet · CreditPurchase · CreditTxn · Relic · Auction · Bid
prisma/seed.ts             channel rows (+ optional sample wishes)
src/lib/channels.ts        the 12 rituals, localized
src/lib/i18n.ts            UI strings ko/en/ja/zh + Accept-Language negotiation
src/lib/money.ts           KRW base, FX, presets, validation
src/lib/payments/          provider interface + mock / paypal / crypto adapters
src/lib/wishes.ts          settlement (idempotent, wishes + credit purchases), wall queries
src/lib/credits.ts         credit packs, anonymous wallet, atomic spend
src/lib/relics.ts          rarity odds + per-channel relic variants (12 × 3 tiers × 4 locales)
src/lib/auctions.ts        list / bid / outbid refund / anti-snipe / settle with fee
src/lib/card.tsx           Satori share card with the name inscribed on the ritual object
src/lib/fonts.ts           per-text Google Fonts subsets by detected script
src/lib/video-timeline.ts  pure drop-moment timeline (easings, per-frame params)
src/lib/video.tsx          Satori → native resvg (parallel) → ffmpeg MP4, job queue, disk cache
src/lib/art.ts             art manifest loader (public/art/manifest.json)
docs/ART_DIRECTION.md      style bible + 2D/3D/motion generation pipeline
src/middleware.ts          ?s=1 share links → attribution cookie
src/app/                   pages: / · /c/[slug] · /w/[id] · /credits · /auctions · /auctions/[id] · /about
src/app/api/               routes listed above
src/components/            RitualScene (SVG), WishForm, WishWall, ChannelCard
tests/                     node:test suites
```
