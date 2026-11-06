# 소원 돌탑 · Wish Cairn

모두가 함께 쌓는 돌탑 하나, 3D로. 소원을 적고 돌을 올리면 돌이 하늘에서 떨어져 탑 위에 자리를 잡고,
그 돌에 이름이 새겨지고, 지금 보고 있는 모든 사람의 화면에서 같은 순간 똑같이 떨어집니다.

One shared stone tower in real 3D. Write a wish, stack a stone: it falls, settles, carries your name,
and lands on every screen that is watching.

## Run

```bash
npm install            # only three.js
node server.js         # http://localhost:3000   (Node ≥ 22.13: built-in SQLite)
npm test
```

- `PORT` (3000) · `DB_PATH` (`cairn.db`) · `RATE_PER_MIN` (stones per minute per IP, 5) · `NODE_ENV=production` caches index.html
- Behind a reverse proxy, keep SSE unbuffered (`X-Accel-Buffering: no` is sent).

## What's in the scene

Stones come in three families (slab, river stone, chunk), each with its own noise, rim and a slight lean, so no
two look alike; colours mix warm tan, grey-blue and dark basalt, with the lowest stones darker and wetter, and
roughness and bump vary per stone. Every stone has a soft contact shadow on the stone (or ground) beneath it,
which is what stops the tower from floating. From the edge of the sky upward the waters above throw caustic
light onto upward-facing surfaces (injected into the stone shader), the ground carries a low drifting mist in the
meadow bands, and light shafts fall through the firmament and the waters above.


- **Night sky** as a gradient dome with a moon and 2,200 twinkling stars; the sky is also the PBR environment light.
- **Moonlight** (key, soft shadows), a **lantern** by the tower (warm point light, flickers), hemisphere fill, exponential fog.
- **Stones**: procedural river stones (icosahedron + 3D noise, flattened top/bottom), PBR material with a procedural
  albedo/bump texture; deterministic shape, color, offset and tilt per stone id so everyone sees the same tower.
- **Names** carved into the stone surface as a projected decal (a dark groove with a lit lower edge) on the side facing the default view; tap a stone to read the wish itself. English UI by default, `?lang=ko` for Korean.
- **Physics**: new stones fall under gravity, bounce once, squash-and-settle, kick up dust.
- **Older stones** (beyond the newest 20) become an instanced mound that grows up to meet the tower, so the tower never sinks as the window moves.
- **Post**: ACES tone mapping, bloom, vignette. Mobile gets fewer particles, smaller shadow maps, lighter bloom.

## The world: under the firmament

The whole site is set beneath the biblical firmament: the waters were one, a firmament was set between them,
and we live under it. Every stone is a wish sent upward; the tower climbs toward the waters above, and when it
touches the firmament (250 m) the waters stir. That story is told once on the first visit (the 🌊 button reopens
it, six languages), the HUD always shows the distance to the firmament in metres and stones, the page title and
share cards carry "Under the Firmament", and the sky shows it from the ground: a faint caustic shimmer of the
upper waters at the zenith even in the meadow, a water ceiling that hangs high over a small tower and comes
down to just overhead as the tower climbs, drops falling past the stones only in the last band.

### The touch: when the tower reaches the firmament

Once, ever, when the tower's height passes `FIRMAMENT_M` (250 m ≈ 2,778 stones), the server fires the `firmament`
event: the stone that crossed the line becomes the **keystone** (a wave mark engraved beside its name, named in its
tooltip), every wallet that has ever placed a stone receives `FIRMAMENT_REWARD` stone credits (1) "from the waters
above", and the keystone's wallet receives `FIRMAMENT_KEYSTONE_REWARD` more (10). Everyone watching sees the
ceremony live over SSE: the water ceiling surges, a pillar of light comes down onto the keystone, every stone lights
up from the bottom, drops pour, and the title appears for nine seconds. Wallets that were away are told on their
next visit ("🌊 The waters above give you 1 stone"), once. After the touch the world has a sixth band, **the
waters above** (from 1.6 × the firmament height): the tower climbs inside the upper sea.

Preview without waiting: `/?ceremony=1` plays it on the current tower; `tools/make-video.mjs --ceremony` renders
it into a clip. Unit test: `test-firmament.js` (uses a 4-stone firmament).

The on-chain half is an operator step, because the community allocation is a wallet, not a contract rule:
`tools/firmament-airdrop.mjs --amount 100 --until <keystone chain id> --dry-run` lists every wallet that owns an
on-chain stone stacked before the touch; run again with `COMMUNITY_KEY` to send that many CAIRN to each (one share
per wallet), with a resumable log in `out/`.

### The moon and the sun

Both are tied to height. In the meadow the moon sits below the hills; above the trees it peeks over them, large
and low on the left; above the clouds it is up, and on the right a sun the ground never sees rises just over the
cloud sea, with a warm band along its horizon and a warm side light on the stones. Drifting cloud puffs ring the
tower at that height so the two show between them. Under the firmament both dim to a shimmer through the water.
The camera tilts up a little in those bands so the sky is in frame, and entering a band shows a one-line toast
("Above the clouds: the moon comes out, and a sun the ground never sees").

## The climb: the world changes with height

Height is the tower's cumulative height (stones × 9 cm), so the scene can rise even though only the newest
stones are drawn. Five bands blend into each other as the number grows, and the HUD always names the next one:

| from | band | what changes |
|---|---|---|
| 0 m | Meadow | moonlit grass, lantern, fireflies, fog |
| 8 m | Above the trees | fog thins, fireflies gone, a cloud layer appears below |
| 25 m | Above the clouds | a sea of clouds under the tower, bigger moon, more stars |
| 80 m | Edge of the sky | the dome turns glassy teal, aurora curtains, the lights in it sharpen |
| 250 m | The Firmament | the waters above: a ceiling of water with caustic light, drops falling past the stones |

The worldview is the old one: the sky is a dome holding back the waters above, and the tower climbs toward it.
Preview any height with `/?alt=120`.

## Height, and why you keep stacking

- The HUD leads with the **tower height** (one stone = `STONE_CM`, default 9 cm), a progress bar to the next
  milestone (1 m, 2 m, 3 m, 5 m, 8 m, 10 m …) and "N stones to X m". Crossing a milestone flashes the sky.
- Every landing floats **+9 cm** off the stone. After you stack: "You've placed N stones · lifted the tower X".
- Name tags appear only for the stone that **just landed** (3 s) and for **your own** stone (6 s, gold).

## Free stone, then paid

Every visitor gets an anonymous wallet (httpOnly cookie, no account).

- **One free stone every 24 h** (`FREE_EVERY_HOURS`). The form shows "Today's free stone is ready" or a countdown.
- After that a stone costs **one credit**. Credits come in packs: `PACK_STONES` (10) for `PACK_PRICE_USD` (0.99).
- Providers: **PayPal** (Orders v2, capture on return) and a dev-only **mock** page. `PAYMENT_PROVIDERS=paypal`
  plus `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=live|sandbox`, `APP_URL=https://…`.
  The mock provider is disabled in production unless `ALLOW_MOCK_PAYMENTS=1`.
- A $0.99 pack is the smallest amount that survives PayPal's fixed fee; a single ₩100 stone would not.
  Crypto (USDC on an L2) can be added as a third provider with the same `checkout → settleOrder` shape.

Two more things a stone credit buys, both paid by the person who wants them, never by the reader:

- **Sealed wish** (checkbox in the form, +1 stone): the text is stored but only ever returned to its owner's
  wallet; everyone else sees "🔏 Sealed wish" and a wax-seal mark engraved under the name. On-chain stones can
  be sealed at no extra cost (the chain only ever holds the hash).
- **Blessing** (button in a stone's tooltip): send a light to someone else's stone. `FREE_BLESS_PER_DAY` (3)
  are free per wallet per day, then one stone each; once per stone per wallet, never your own. The stone glows
  and a ✦ rises for everyone watching (SSE `bless`); the owner is told "✦ N people blessed your wish" on their
  next visit. Endpoint: `POST /api/stones/<id>/bless`.

## On-chain layer (Base L2): stone NFTs, the token, public sale

`chain/` is a separate Hardhat project (`cd chain && npm install && npm test`, 14 tests, compiles offline).
The token's name and symbol are deployment parameters (`TOKEN_NAME`, `TOKEN_SYMBOL`); the placeholder is **DOL**
and every page reads the deployed symbol, so nothing is hardcoded. Mainnet goes in two stages (`docs/MAINNET.md`):
`STAGE=stones` deploys only StoneCairn with 100% of revenue to the treasury (a MetaMask address is fine), and
`STAGE=token` later deploys token + vesting + RevenueShare + sale and calls `setSplit` on the live StoneCairn.

- **StoneCairn** (ERC-721): every stone is an NFT. `stackWith(token, …)` pays in any whitelisted stablecoin
  (USDC, EURC, JPYC, BRZ … each with its own price), split 50/50 between the treasury and **RevenueShare**.
  `stackFree()` redeems an EIP-712 voucher the server signs for the daily free stone. Only the wish's hash goes on-chain.
- **RevenueShare**: stake CAIRN and receive the tower's revenue pro-rata, in the stablecoins it arrived in.
  The operator can `deposit()` off-chain revenue (card payments converted to USDC) into the same pool.
- **CairnToken** (ERC-20): fixed 1B supply minted once (community 40 / sale 25 / team 15 / treasury 15 / liquidity 5),
  no owner, no mint. Team tokens sit in OpenZeppelin's VestingWallet, 24 months linear.
- **CairnSale**: fixed-price USDC sale with soft cap, hard cap, per-wallet cap and a window. Soft cap missed →
  full refunds; funds never reach the treasury before finalization.
- Design, allocation and sale parameters: `docs/TOKEN.md`. Deploy: `chain/scripts/deploy.js` (writes
  `chain/deployments/<network>.json`).

**Seeds and the garden**: the first stone plants a seed at the foot of the tower; the 🌱 button descends to the
garden. Water it once a day (+1 karma) and it grows through six stages (seed → in bloom at seven waterings); stay
away and it wilts a stage per few days. Soils lie in patches (`soil.js`, shared by server and page): meadow
(balanced, wilts after 3 days), riverbank (×1.4 speed, wilts after 2), rocky ground (×0.7, never wilts), moss
hollow (wilts after 4, where strange seeds bloom). Seeds unlock with karma: wildflower (0), pine (3, evergreen,
loves rock), lotus (10, opens only on river or moss), lantern tree (50, blooms as lights on moss or rock). Tap the
ground to choose a spot (soil shown before you commit), pick a seed, plant; moving a plant starts it over.
Everyone's plants are visible to everyone (`GET /api/seeds`); `POST /api/seed/plant`, `POST /api/seed/water`.

**Karma**: one stone = one wish = one good deed. Every stone placed and every blessing given adds 1 karma to the
wallet; tiers at 1 / 10 / 50 / 200 (pebble, cairn-keeper, mountain, firmament) are names shown in the HUD, with a
toast on each step up. The HUD also shows what the tower has given so far (web pack revenue × the donation share;
on-chain giving is read from the chain). `KARMA_AB=1` hides the karma and giving lines for odd wallet ids, and the
analytics dashboard then shows activation, stones per wallet and purchase rate for the two groups.

**Giving**: `DONATION_BPS` (10%) of every stone's revenue is given away, off the top. On-chain it is a contract rule
(`StoneCairn.setCharity(wallet, bps)`, set from `DONATION`/`DONATION_BPS` at deploy): the share goes to the donation
wallet in the same transaction as the purchase. For web packs the operator transfers the same share monthly and
`/api/metrics` reports the running pledge. The recipient (`DONATION_NAME`) is announced before launch.

**Investor overview `/investors`** (public, no wallet needed): the pitch in one screen with live numbers from
`GET /api/metrics` (visitor stones per day for 14 days, unique wishers, return rate, free → paid conversion, pack
revenue, on-chain stones; seeded stones are excluded and never labelled), the money flow, token allocation and
utility, sale terms read from the sale contract, verifiable guarantees, contract addresses with explorer links,
the plan and the risks. Korean with `?lang=ko`. The X launch thread (en/ko) and posting checklist live in
`docs/X_THREAD.md`.

**Investor page `/invest`**: connect a wallet to see tower height, lifetime distributions, total staked and your
share; buy in the public sale (with the sale's progress, claim or refund after finalization); stake and
unstake CAIRN; see claimable revenue per stablecoin and claim it all at once. Korean with `/invest?lang=ko`.

Server side (`chain-link.js`): set `CHAIN_DEPLOYMENT=chain/deployments/base.json`, `CHAIN_RPC_URL`, and
`VOUCHER_SIGNER_KEY` (the key whose address was deployed as the contract's voucher signer). The server then
exposes the chain config on `/api/me`, registers wish text + salt for a hash on `POST /api/chain/prepare`, and
indexes `Stacked` events so on-chain stones land on the same tower. In the page, "Stack on-chain" connects a
wallet (ethers v6) and calls `stackFree` with a voucher or approves USDC and calls `stack`.

**Wallets (`wallet.js`, shared by both pages)**: finds every installed wallet through EIP-6963 (MetaMask, Rabby,
Coinbase Wallet, Trust, OKX, Phantom …) with a picker when several are installed and a remembered choice;
switches the wallet to Base and *adds the network* if the wallet has never seen it; reconnects silently on the
next visit (never switching chains behind the user's back); follows account and network changes; shows explorer
links for transactions. Without an injected wallet, phones get "open in MetaMask / Coinbase Wallet / Trust"
deep links and desktops a link to install one. No wallet SDK, no project id, no build step.

## Analytics: acquisition, engagement, payments, investment, growth

`/analytics` (public; `?lang=ko`) reads `GET /api/analytics?days=7|30|90`:

- **Acquisition**: visits and unique wishers per day, new wishers, traffic sources (operator only: utm_source /
  `?ref=` / referrer host). Visits come from a first-party `sendBeacon` in the page (`POST /api/visit`: a random
  visit id, referrer, query string, language, seconds on page at `pagehide`). No third-party script, no fingerprint.
- **Engagement**: stones per day, blessings, average time on page, visit → stone activation, D1 / D7 retention of
  new wishers (cohorts at least 8 days old).
- **Payments**: pack revenue per day, orders created vs paid, wisher → buyer conversion.
- **Investment**: on-chain stones per day; sale raised, CAIRN staked and lifetime distributions read from the chain.
- **Growth**: every KPI tile shows the last 7 days against the 7 before, with the % change.

Operator view: open `/analytics?token=<ADMIN_TOKEN>` once (stored in sessionStorage) or use the "enter token"
link; it adds the sources table and `GET /api/analytics.csv` (daily rows, 90 days). Seeded stones are excluded
from every visitor metric and never labelled. The chart palette was validated for colour-vision deficiency on the
dark surface.

## Languages

The tower page ships in English, Korean, Japanese, Spanish, Portuguese and Chinese; the investor pages in English
and Korean. `i18n.js` picks the language in this order: `?lang=` in the URL (then remembered), the visitor's saved
choice, the browser's language list (`pt-BR` → pt, `zh-TW` → zh), else English. A visitor whose language the page
does not have gets English. The 🌐 selector in the tower's top bar switches and remembers. Missing keys in any
language fall back to English, so a partial translation never breaks the page.

## Daily post to X: `tools/post-x.mjs`

Posts "the tower is 1.08 m. +12 stones today. Sora stacked the top stone. Stack yours → …" with a fresh
portrait screenshot of the tower. Set `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` (an X
developer app with **Read and Write** user permission; regenerate the access token after switching to read/write;
the free tier allows this once a day), optionally `X_SITE_URL`, `X_LANG=en|ko`, `X_DAY0=<launch date>` for the
"Day N" prefix. Then either run it from cron, or set `X_AUTOPOST=HH:MM` (UTC) and the server runs it daily.
`--dry-run` prints the text and saves the image to `out/x-post.png` without posting; `--selftest` checks the
OAuth 1.0a signer against X's documented example. Media goes through `POST /2/media/upload`, the post through
`POST /2/tweets`.

## Launch clip: `tools/make-video.mjs`

Renders a vertical 1080×1920 MP4 of stones dropping onto the live tower, for X / TikTok / Shorts:

```bash
node tools/make-video.mjs --url http://localhost:3000 --names "Sora,Minjun,Aroha,Diego,Yuki,Amara" \
     --seconds 18 --fps 24 --caption "wishcairn.app" --sub "one tower · stacked by the whole world" --out out/tower.mp4
```

The page is opened with `?video=1`: it stops animating on its own and exposes `window.__video` (`step(dt)`,
`drop(name)`, `caption(title, sub)`), so every frame is simulated deterministically, screenshotted and piped into
ffmpeg. Dropped stones exist only in the capture; nothing is written to the server. Needs ffmpeg and Playwright
(`npm i -D playwright && npx playwright install chromium`). About 0.7 s per frame on a CPU renderer, so an 18 s
clip takes 4–5 minutes; `--lang ko` for Korean HUD text.

## Virtual early users (seeding)

An empty tower is the worst first impression. `tools/seed-users.mjs` creates virtual early users:
personas across ten languages (Korean and English first), 40% anonymous, each with a mood and a topic,
and asks Claude for the kind of wish a real person types in two seconds. Without API credentials it
uses a built-in bank of wishes instead.

```bash
ADMIN_TOKEN=change-me node server.js                                           # the server needs the token
node tools/seed-users.mjs preview --count 20                                   # look before you write
ADMIN_TOKEN=change-me node tools/seed-users.mjs backfill --count 400 --days 14 # history, spread like real traffic
ADMIN_TOKEN=change-me node tools/seed-users.mjs live --per-hour 6              # keeps stacking (run under pm2/systemd)
```

- Backfilled stones get past timestamps following a day/night curve across time zones; live stones land with
  Poisson-ish gaps so they never look scheduled, and every viewer sees them fall.
- Seeded stones are stored with `bot=1`. The public API never exposes it, but you can always separate them
  (`SELECT COUNT(*) FROM stones WHERE bot=1`). The "here now" count only ever counts real open pages.
- Model: `claude-opus-5-5` at low effort with the system prompt cached; a 25-wish batch costs well under a cent.
- Taper `--per-hour` down as real users arrive, and say somewhere in your terms that the tower was seeded.

## Usability

- Tap any stone to read its wish. **Recent wishes** drawer; tapping an entry flies the camera to that stone.
- After stacking: **Find my stone** (camera + glow) and **Share link** (`?s=<id>` deep-links to the stone; native share on mobile).
- Enter stacks; Shift+Enter is a newline. Name is remembered. Orbit/pinch to look around; the camera idles back to a slow orbit.
- "N here now" is the live count of open pages. New stones from others show a small toast.

## Generated assets (the premium look)

The scene is fully procedural out of the box. `tools/generate-assets.mjs` upgrades it with hosted generative models
and writes `assets/manifest.json`; whatever is present is loaded at runtime, the rest stays procedural.

| Layer | Model | Env key | Output |
|---|---|---|---|
| 360° night sky (also lights the scene) | Blockade Labs Skybox AI | `BLOCKADE_API_KEY` | `assets/skybox.jpg` |
| Seamless stone texture | FLUX 1.1 Pro Ultra (fal.ai) | `FAL_KEY` | `assets/stone_albedo.png` |
| Stone mesh (scanned look) | Meshy text-to-3D, PBR refine | `MESHY_API_KEY` | `assets/stone.glb` |

```bash
BLOCKADE_API_KEY=… FAL_KEY=… MESHY_API_KEY=… node tools/generate-assets.mjs            # all three
node tools/generate-assets.mjs --sky                                                   # one layer
```

Drop your own files in `assets/` and point the manifest at them to skip the APIs (normal/roughness maps are supported too).
Keep sacred-site imagery stylized; the prompts avoid people, text and religious symbols on purpose.

## Files

```
server.js                 SQLite stones + wallets + orders · /api/me · GET/POST /api/stones · /api/buy · PayPal return · /pay/mock · /api/events (SSE) · static
index.html                the 3D scene, UI, live updates (one file, ES modules via import map)
invest.html               investor page: sale, staking, revenue claims (ethers v6)
tools/generate-assets.mjs generative asset pipeline → assets/manifest.json
tools/seed-users.mjs      virtual early users: Claude-written wishes, backfill + live modes
chain-link.js             chain config, EIP-712 voucher signing, Stacked event indexer
chain/                    Hardhat project: StoneCairn, CairnToken, CairnSale, tests, deploy script
docs/TOKEN.md             tokenomics and raise structure
test.js                   validation, ordering, HTTP + SSE round-trip
```
