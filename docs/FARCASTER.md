# Farcaster 포스트 문구

Farcaster(Warpcast)는 X보다 짧고 담백한 톤이 통합니다. 캐스트는 1,024자 제한이지만 300자 안쪽이 반응이 좋습니다.
채널은 `/base`(빌더·투자자), `/onchain`, `/art`, `/korea` 순으로 올리되, 같은 글을 하루에 여러 채널에 올리진 마세요.
`{URL}`은 https://wish-engine-production.up.railway.app, `{HEIGHT}`·`{N}`은 당일 `/api/metrics` 값으로 바꿉니다.
첫 캐스트엔 반드시 영상(세로 클립, `tools/make-video.mjs`)이나 스크린샷을 붙입니다. 링크만 있는 캐스트는 거의 안 읽힙니다.

---

## 1. 런치 캐스트 (`/base`)

> Humans have stacked stones to make a wish for thousands of years. We built one tower for all of us, on Base.
>
> Stack a stone, make a wish, see it land next to everyone else's. It's {HEIGHT} m tall right now and it never stops.
>
> Half of every stone sold pays stakers in the stablecoin it was bought with. 10% is given away — enforced in the contract, not promised.
>
> {URL}

(영상 첨부. 한 줄 요약이 먼저, 토큰 얘기는 셋째 줄 한 번만.)

## 2. 빌더용 캐스트 (`/base`, 런치 다음 날)

> How Wish Cairn works under the hood, for builders:
>
> · one Node server, no framework, SQLite, SSE for the live tower
> · stones are ERC-721 on Base, paid in USDC / EURC / JPYC / BRZ
> · 50% of every stone → RevenueShare → stakers, same coin, same tx
> · 10% → donation wallet, same tx
> · free daily stone = EIP-712 voucher signed by the server
> · wallet layer with no SDK: EIP-6963, auto chain add, mobile deep links
>
> Open source: {REPO}. Happy to answer anything.

## 3. 세계관 캐스트 (`/art` 또는 `/onchain`)

> The whole site is set under the firmament. The waters were one; a firmament was set between them; we live beneath it.
>
> Every stone is a wish sent upward. At 250 m the tower touches the firmament, the waters above stir, and everyone who ever stacked receives a stone from above.
>
> We're at {HEIGHT} m. {URL}

(궁창 구간 스크린샷 첨부: `/?alt=260`)

## 4. 매일 올리는 캐스트 (`/base`, 짧게)

> Day {D} · {HEIGHT} m · +{N} stones today · {NAME} stacked the top stone. {URL}

(그날 탑 스크린샷. `tools/post-x.mjs --dry-run`이 만드는 `out/x-post.png`를 그대로 쓰면 됩니다.)

## 5. 카르마·기부 캐스트 (런치 1주 뒤)

> One stone = one wish = one good deed.
>
> Every stone you stack and every blessing you give adds karma. Tiers: pebble, cairn-keeper, mountain, firmament. And 10% of every stone goes to {CAUSE} — the contract sends it in the same transaction you stack with.
>
> The tower has given ${GIVING} so far. {URL}

## 6. 궁창 도달 캐스트 (그날)

> The tower touched the firmament.
>
> {N} wishers, {STONES} stones, {DAYS} days. Everyone who ever stacked just received a stone from the waters above. The keystone belongs to {NAME}.
>
> Next: the waters above. {URL}

(`tools/make-video.mjs --ceremony`로 만든 클립 첨부)

---

## 댓글 대응 메모

- "또 토큰이냐" → "세일은 지표 4주 공개 뒤에 열고, 소프트캡 미달이면 전액 환불됩니다. 지금은 돌만 쌓는 중이에요. 토큰 없이도 사이트는 그대로 돌아갑니다."
- "수익 모델은?" → "돌 하나 0.1달러, 하루 하나는 무료. 세일 전에 실제 매출 숫자부터 공개합니다: {URL}/investors"
- "감사는?" → "돈을 쥐는 세일·분배 컨트랙트는 감사 뒤에 메인넷에 올립니다. 지금 메인넷엔 돌 컨트랙트만 있고 매출은 바로 트레저리로 갑니다."
- 투자 문의 DM → 개요 페이지 링크를 먼저 보내고, 지표가 나오는 날짜를 말해 주세요. 즉석에서 약속하지 마세요.
