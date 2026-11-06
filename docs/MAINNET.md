# 메인넷으로 실제 운영하기 (Base)

테스트넷 리허설 없이도 갈 수 있도록, 돈이 실제로 움직이는 순서대로 적었습니다. 두 단계로 나눕니다.

| 단계 | 올라가는 것 | 돈의 흐름 | 언제 |
|---|---|---|---|
| **1단계 · 돌** | `StoneCairn` 하나 | 돌 매출 100%가 트레저리(당신의 메타마스크 주소)로 | 지금 |
| **2단계 · 토큰** | 토큰 · 베스팅 · `RevenueShare` · `CairnSale` | 돌 매출의 50%가 스테이커에게, 세일 모금은 마감 후 트레저리로 | 토큰 이름이 정해지고 감사가 끝난 뒤 |

토큰 이름과 심볼은 배포 때 정해지고 그 뒤엔 바꿀 수 없습니다. 그래서 이름이 정해지기 전엔 토큰을 메인넷에 올리지 않습니다. 코드·문서·화면에서 쓰는 **DOL**은 임시 이름이고, 2단계 배포 때 `TOKEN_NAME`·`TOKEN_SYMBOL`로 진짜 이름을 넣으면 화면 전체가 그 이름으로 바뀝니다.

## 네트워크: Base 메인넷

| 항목 | 값 |
|---|---|
| 체인 ID | 8453 |
| RPC | `https://mainnet.base.org` (공개) · 운영용으로는 Alchemy/QuickNode 엔드포인트 권장 |
| 탐색기 | https://basescan.org |
| 가스 | ETH (Base 위의 ETH). 배포 전체에 0.003 ETH 안팎, 운영 중엔 거의 안 듦 |
| 결제 코인 | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, EURC `0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42` (스크립트에 내장) |

왜 Base인가: 수수료가 거의 0(거래당 1원 미만), 메타마스크가 기본 지원, Circle이 USDC·EURC를 직접 발행, 코인베이스 사용자가 바로 들어옵니다. 이더리움 메인넷은 돌 하나(0.1달러) 결제에 수수료가 몇 달러라 불가능하고, 폴리곤·아비트럼도 가능하지만 투자자 유입 면에서 Base가 가장 낫습니다.

## 투자금과 매출을 받을 지갑 (메타마스크)

1. 메타마스크에서 **새 계정**을 하나 만들어 "Treasury"라고 이름 붙입니다. 평소 쓰는 계정과 분리하세요.
2. 메타마스크 네트워크에 Base를 추가합니다. 네트워크 선택 → "네트워크 추가" → Base가 목록에 있으면 바로, 없으면 chainlist.org에서 "Base" 검색 → 추가.
3. 그 계정의 **주소**(0x로 시작하는 42자)를 저에게 주시면 됩니다. 비공개 키는 필요 없습니다. 이 주소가 `TREASURY`가 되어,
   - 1단계: 팔린 돌의 USDC·EURC가 트랜잭션마다 바로 이 주소로 들어옵니다.
   - 2단계: 세일 마감 후 `finalize()`를 호출하면 모금된 USDC가 이 주소로 들어오고, 돌 매출의 50%도 계속 들어옵니다.
4. 메타마스크에서 USDC가 보이려면 토큰 추가에서 위 USDC 주소를 넣으면 됩니다.

세일 모금액이 커지면(수십만 달러) 트레저리를 Safe 멀티시그로 바꾸는 걸 권합니다. `setSplit`과 세일의 `treasury`는 오너가 바꿀 수 있어서 나중에 옮길 수 있습니다.

## 1단계 배포 (지금)

필요한 것: 배포자 지갑(메타마스크의 또 다른 계정, 비공개 키를 `DEPLOYER_KEY`에), 그 지갑에 Base ETH 0.01 정도(코인베이스에서 Base 네트워크로 출금하면 바로 들어옵니다), 바우처 서명자 주소, 트레저리 주소.

```bash
cd chain
# .env: DEPLOYER_KEY, VOUCHER_SIGNER(주소), TREASURY(메타마스크 Treasury 주소), STAGE=stones
STAGE=stones npx hardhat run scripts/deploy.js --network base
npx hardhat verify --network base <StoneCairn주소> 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 100000 <treasury> 0x0000000000000000000000000000000000000000 0 <voucherSigner> <deployer>
```

`chain/deployments/base.json`을 커밋하고, 서버 `.env`에 `CHAIN_DEPLOYMENT=chain/deployments/base.json`, `CHAIN_RPC_URL`, `VOUCHER_SIGNER_KEY`를 넣고 재시작합니다. 이때부터 "Stack on-chain"은 실제 USDC를 받고, 투자자 페이지는 "1단계가 돌아가고 있습니다"를 표시합니다.

## 2단계 배포 (이름이 정해진 뒤)

```bash
cd chain
# .env에 추가: TOKEN_NAME="정식 이름", TOKEN_SYMBOL=정식심볼, TEAM, COMMUNITY, LIQUIDITY, SALE_START, SALE_DAYS, 캡 값들
STAGE=token npx hardhat run scripts/deploy.js --network base
```

스크립트가 기존 `base.json`의 StoneCairn을 찾아 `setSplit`으로 매출의 50%를 새 RevenueShare로 돌리고, 파일을 갱신합니다. 서버를 재시작하면 투자자 페이지와 대시보드에 세일·스테이킹이 열립니다. 그 전에 `CairnSale`·`RevenueShare` 외부 감사를 받으세요. 이 둘이 돈을 쥡니다.

## 돌아가기 전 체크리스트

- [ ] Treasury 주소를 메타마스크에서 두 번 확인 (한 글자라도 틀리면 매출이 영영 사라집니다)
- [ ] 배포자 지갑 ETH 잔액 확인
- [ ] 배포 직후 basescan에서 `treasury()`·`priceOf(USDC)`·`voucherSigner()` 읽어보기
- [ ] 서버 로그에 `chain: base`가 찍히는지, `/api/me`의 `chain.stage`가 `stones`인지
- [ ] 실제 지갑으로 돌 하나(0.1 USDC) 올려서 트레저리에 들어오는지 확인
