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
server.js                 SQLite stones · GET/POST /api/stones · GET /api/events (SSE) · static /vendor/three and /assets
index.html                the 3D scene, UI, live updates (one file, ES modules via import map)
tools/generate-assets.mjs generative asset pipeline → assets/manifest.json
test.js                   validation, ordering, HTTP + SSE round-trip
```
