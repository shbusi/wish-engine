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

- **Night sky** as a gradient dome with a moon and 2,200 twinkling stars; the sky is also the PBR environment light.
- **Moonlight** (key, soft shadows), a **lantern** by the tower (warm point light, flickers), hemisphere fill, exponential fog.
- **Stones**: procedural river stones (icosahedron + 3D noise, flattened top/bottom), PBR material with a procedural
  albedo/bump texture; deterministic shape, color, offset and tilt per stone id so everyone sees the same tower.
- **Names** carved into the stone surface as a projected decal (a dark groove with a lit lower edge) on the side facing the default view; tap a stone to read the wish itself. English UI by default, `?lang=ko` for Korean.
- **Physics**: new stones fall under gravity, bounce once, squash-and-settle, kick up dust.
- **Older stones** (beyond the newest 20) become an instanced mound that grows up to meet the tower, so the tower never sinks as the window moves.
- **Post**: ACES tone mapping, bloom, vignette. Mobile gets fewer particles, smaller shadow maps, lighter bloom.

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

## On-chain layer (Base L2): stone NFTs, CAIRN token, public sale

`chain/` is a separate Hardhat project (`cd chain && npm install && npm test`, 13 tests, compiles offline).

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
