# Base Builder Grant 신청서 초안

Base Builder Grants는 "이미 Base 위에서 돌아가는 것"에 소급해서 주는 소액 그랜트(보통 1~5 ETH)입니다. 긴 사업계획서보다
**돌아가는 링크, 온체인 주소, 숫자** 셋이 핵심입니다. 신청 창구는 base.org/grants(또는 Base 팀의 Farcaster 지명)이고,
양식 항목은 바뀌니 아래 답변을 항목에 맞춰 옮겨 쓰세요. `{…}`는 신청 당일 값으로 채웁니다.

**신청 전 체크**: (1) 메인넷 1단계 배포 완료(StoneCairn 주소가 있어야 "Base에서 돌아간다"가 성립), (2) 최소 2주 지표,
(3) Farcaster 계정으로 런치 캐스트 게시. 셋 중 하나라도 없으면 신청을 미루는 게 낫습니다.

---

**Project name**
Wish Cairn — one stone tower the whole world stacks, under the firmament

**One-line description**
A shared 3D cairn where anyone on Earth stacks a stone and makes a wish; each stone can be an on-chain NFT on Base paid in the stablecoin of your country, and every paid stone pays stakers and a charity in the same transaction.

**What have you built on Base? (live links)**
- Live site: {URL}
- Investor overview with live metrics: {URL}/investors
- Analytics (public): {URL}/analytics
- StoneCairn contract (Base mainnet, verified): https://basescan.org/address/{STONE_CAIRN}
- Donation wallet: https://basescan.org/address/{DONATION}
- Source: {REPO} (contracts in `chain/`, 15 tests)

**Why Base**
Stones cost $0.10. That only works where a transaction costs less than a cent, where USDC and EURC are native, and where a MetaMask or Coinbase Wallet user can pay without a bridge. Base is the only chain where all three are true. Payments are per-stablecoin (USDC, EURC today; JPYC, BRZ as they issue on Base), so a wisher in Tokyo and one in São Paulo pay in their own money and stakers receive it in the same coin, with no conversion.

**What's on-chain**
- `StoneCairn` (ERC-721): every stone an NFT, wish text stays private (only its hash is on-chain), free daily stone via EIP-712 voucher signed by the server.
- Revenue split enforced in the contract: {REVENUE_BPS}% of every paid stone to `RevenueShare` (stakers, paid in the same coin), {DONATION_BPS}% to the donation wallet, the rest to the treasury — all in the purchase transaction.
- Token stage (name pending, placeholder DOL): fixed supply, no mint, no owner, team vesting in OpenZeppelin `VestingWallet`, public sale with full refunds below the soft cap. Not deployed until audited.

**Traction ({DATE})**
- Stones placed by visitors: {STONES} ({STONES_7D} in the last 7 days)
- Unique wishers: {WISHERS} · return rate D7: {D7}%
- Free → paid conversion: {PAID_PCT}% · pack revenue: ${REVENUE}
- On-chain stones: {ONCHAIN} · given to charity so far: ${GIVING}
- Languages: EN, KO, JA, ES, PT, ZH (auto-detected)

**What makes it different**
It is not a mint page. It is one object everyone changes together: the tower is {HEIGHT} m tall, the world around it changes with height (meadow → above the clouds → the firmament), and when it reaches 250 m everyone who ever stacked receives a stone "from the waters above" — a once-only event the whole community is climbing toward. Karma (one stone = one wish = one good deed) and the enforced 10% donation turn a micro-payment into something people are proud to share.

**What the grant would fund**
1. External audit of `RevenueShare` and `CairnSale` before the token stage (~{AUDIT_USD}).
2. Image-to-3D stone generation and per-band skies so the tower looks like a place, not a demo (GPU time).
3. Translations and community moderation for the top non-English cohorts.
No salaries. Every dollar is listed on the investor page.

**Team**
{NAME} — solo founder, Korea. Built the product end to end (3D scene, server, contracts, analytics). Contact: Farcaster @{FC_HANDLE}, X @{X_HANDLE}, email {EMAIL}.

**Links**
Site {URL} · Farcaster {FC_URL} · X {X_URL} · Source {REPO}

---

## 한국어 메모 (양식에 안 들어감)

- 숫자는 `{URL}/api/metrics`와 `/api/analytics?days=30`에서 그대로 복사하세요. 부풀리지 마세요. Base 팀은 온체인으로 바로 확인합니다.
- "What the grant would fund"에 감사 비용을 첫 줄에 둔 이유: Base 팀이 가장 좋아하는 용처이고, 우리 로드맵의 실제 병목입니다.
- 팀 항목은 실명이 아니어도 되지만 연락 가능한 Farcaster 계정은 필수입니다. 익명으로 가려면 Farcaster 핸들만 적으세요.
- 신청 뒤 Base 팀 계정(@base, @jessepollak)이 보는 `/base` 채널에 캐스트를 올려 두면 심사와 무관하게 지명될 확률이 올라갑니다.
