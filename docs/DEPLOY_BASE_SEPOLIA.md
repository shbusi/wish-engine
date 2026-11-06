# Base Sepolia 배포 가이드 (테스트넷 리허설)

메인넷과 같은 절차를 가짜 돈으로 한 번 통째로 돌려보는 단계입니다. 끝나면 `--network base`로 바꾸는 것 외에는 달라지는 게 없습니다.

| 항목 | 값 |
|---|---|
| 체인 ID | 84532 |
| RPC | `https://sepolia.base.org` (공개, 무료, 느릴 수 있음) · 대안: Alchemy/QuickNode의 Base Sepolia 엔드포인트 |
| 탐색기 | https://sepolia.basescan.org |
| 가스 토큰 | Base Sepolia ETH (무료 faucet) |
| 결제 스테이블 | 기본은 우리 모의 토큰(USDC·EURC·JPYC·BRZ, 누구나 mint 가능). Circle 테스트넷 USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`도 사용 가능 |

---

## 0. 준비물 체크리스트

- [ ] 메타마스크(또는 Rabby) 설치, Base Sepolia 네트워크 추가
- [ ] 지갑 3개의 역할 구분 (아래 1단계)
- [ ] Base Sepolia ETH 약 0.05 (배포 전체에 0.01~0.02 정도 듦)
- [ ] basescan API 키 (컨트랙트 소스 검증용, 선택)
- [ ] Node 22 이상, 이 레포

## 1. 지갑 역할을 나눕니다

테스트넷이라도 메인넷과 같은 구조로 연습하는 게 목적입니다.

| 지갑 | 용도 | 키가 가는 곳 |
|---|---|---|
| **배포자(Deployer)** | 컨트랙트 배포, 세일·StoneCairn·RevenueShare의 오너 | `chain/.env`의 `DEPLOYER_KEY` (배포 때만) |
| **바우처 서명자(Voucher signer)** | 서버가 "오늘의 무료 돌" 바우처에 서명하는 키. 유출되면 무료 돌 무한 발행이라 배포자와 분리 | 서버 `.env`의 `VOUCHER_SIGNER_KEY`. 배포 시엔 **주소만** `VOUCHER_SIGNER`로 |
| **트레저리** | 돌 매출의 50%와 세일 모금액이 들어오는 곳. 메인넷에선 멀티시그(Safe) | 주소만 `TREASURY` |

테스트넷에선 메타마스크에서 계정 3개를 만들어 쓰면 됩니다. 키 내보내기: 메타마스크 → 계정 상세 → 비공개 키 표시.

## 2. 테스트 ETH 받기

배포자 지갑 주소로 아래 중 하나에서 받습니다. 하루 한도가 있으니 두 군데 받아두면 편합니다.

- Coinbase Developer Platform faucet: https://portal.cdp.coinbase.com/products/faucet (Base Sepolia 선택)
- Alchemy faucet: https://www.alchemy.com/faucets/base-sepolia
- Superchain faucet: https://console.optimism.io/faucet

받은 뒤 https://sepolia.basescan.org 에서 주소를 검색해 잔액을 확인합니다.

## 3. 환경변수

```bash
cd chain
cp .env.example .env     # 값을 채웁니다. .env는 git에 올라가지 않습니다.
```

최소 필수: `DEPLOYER_KEY`, `VOUCHER_SIGNER`(주소). 나머지는 기본값(배포자 주소)으로 채워집니다.
세일을 바로 열어 보고 싶으면 `SALE_START`를 몇 분 전 시각으로, 기간을 짧게(`SALE_DAYS=1`) 두세요.

> `chain/.env`는 hardhat이 자동으로 읽습니다. `source` 같은 셸 명령이 필요 없고 윈도우 cmd/PowerShell에서도 그대로 됩니다. 셸에 이미 같은 이름의 변수가 있으면 그쪽이 우선합니다.

## 4. 배포

```bash
cd chain
npm install            # 처음 한 번
npm test               # 13개 통과 확인
npx hardhat run scripts/deploy.js --network baseSepolia
```

> 윈도우에서 `npm test`가 `MODULE_NOT_FOUND`(mocha 관련 스택)로 죽으면 설치가 중간에 끊긴 겁니다. `chain` 폴더에서 `node_modules`와 `package-lock.json`을 지우고 `npm install`을 다시 하세요. Node는 `node -v`로 22 이상인지 확인합니다.
> `Cannot read properties of undefined (reading 'address')` 또는 `No deployer account`는 `DEPLOYER_KEY`가 비어 있다는 뜻입니다. `chain/.env`가 `chain` 폴더 바로 안에 있고 키가 `0x`로 시작하는지 확인하세요.

출력 예:
```
network baseSepolia · deployer 0x…
Mock USDC 0x…  Mock EURC 0x…  Mock JPYC 0x…  Mock BRZ 0x…
VestingWallet (team) 0x…
CairnToken 0x…
RevenueShare 0x…
CairnSale 0x… · 250000000.0 CAIRN at $0.02
StoneCairn 0x… · USDC, EURC, JPYC, BRZ · 50% to stakers
wrote deployments/baseSepolia.json
```

`chain/deployments/baseSepolia.json`이 서버와 투자자 페이지가 읽는 단일 진실입니다. **이 파일은 커밋하세요** (주소뿐, 비밀 없음).

실패할 때 흔한 원인: 가스 부족(faucet 더 받기), RPC 타임아웃(명령 재실행 또는 `BASE_SEPOLIA_RPC_URL`을 Alchemy로), `SALE_START`가 과거인데 `SALE_DAYS`가 0.

## 5. 소스 검증 (선택이지만 권장)

basescan에 소스를 올려두면 투자자가 컨트랙트를 읽을 수 있습니다. https://basescan.org/myapikey 에서 키를 받아 `BASESCAN_KEY`에 넣고, 배포 출력의 주소와 생성자 인자로 검증합니다.

```bash
npx hardhat verify --network baseSepolia <CairnToken주소> <community> <deployer> <vesting> <treasury> <liquidity>
npx hardhat verify --network baseSepolia <RevenueShare주소> <CairnToken주소> <deployer>
npx hardhat verify --network baseSepolia <StoneCairn주소> <usdc> 100000 <treasury> <RevenueShare주소> 5000 <voucherSigner> <deployer>
```

(CairnSale은 인자가 많으니 `deployments/baseSepolia.json`의 값을 순서대로: token usdc tokenPrice softCap hardCap maxPerWallet saleStart saleEnd treasury deployer)

## 6. 서버 연결

레포 루트에서:

```bash
cp .env.example .env
# 채울 것: CHAIN_DEPLOYMENT=chain/deployments/baseSepolia.json, CHAIN_RPC_URL, VOUCHER_SIGNER_KEY(서명자 키), ADMIN_TOKEN
node --env-file=.env server.js
```

(윈도우도 같은 명령입니다. Node 22의 `--env-file`이 `.env`를 읽습니다.)

시작 로그에 `chain: baseSepolia`가 찍혀야 합니다. `curl localhost:3000/api/me`의 `chain.stables`에 네 코인이 보이면 연결된 겁니다.

## 7. 메타마스크로 실제 흐름 테스트

1. 메타마스크를 Base Sepolia로 전환하고 **배포자가 아닌** 계정(일반 유저 역할)을 선택합니다. 가스용 ETH 조금 필요.
2. 모의 스테이블코인을 받습니다. basescan의 Mock USDC 주소 → Contract → Write Contract → `mint(내주소, 1000000000)` (=1,000 USDC). 토큰을 메타마스크에 추가하면 잔액이 보입니다.
3. 탑 페이지(`/`)에서 "Stack on-chain" 체크 → 코인 선택 → 돌 올리기. 첫 번째는 무료 바우처(`stackFree`)라 USDC 승인 없이 서명 한 번, 두 번째부터 `approve` + `stackWith` 두 번 서명.
4. 몇 초 안에 인덱서가 돌을 탑에 올립니다. basescan에서 트랜잭션의 `Stacked` 이벤트를 확인합니다.
5. `/invest`에서 다른 계정(투자자 역할)으로 연결 → 세일 구매(USDC) → 배포자가 CAIRN을 보내주면 스테이킹 → 유저가 돌을 더 올리면 청구액이 뜨는지 → 청구.

## 8. 메인넷으로 가기 전에

- 감사: `CairnSale`과 `RevenueShare`가 돈을 쥡니다. 외부 감사 없이 메인넷 금지.
- 트레저리를 Safe 멀티시그로, 서명자 키를 서버 비밀 저장소(KMS 등)로.
- `scripts/deploy.js --network base`: USDC·EURC는 실제 주소가 자동으로 들어갑니다. 다른 코인은 `STABLES`로 지정.
- 가격 갱신 운영: 스테이블코인 환율이 1% 이상 움직이면 `setPrice`.

## 9. 이 세션에서 제가 배포하려면

이 클라우드 환경은 기본적으로 허용된 호스트로만 나갑니다. 제가 직접 배포·검증을 돌리려면 환경에 `sepolia.base.org`와 `api-sepolia.basescan.org`가 허용돼야 하고, 환경변수 설정 화면에서 `DEPLOYER_KEY`와 `VOUCHER_SIGNER_KEY`를 직접 넣어주셔야 합니다(저는 비밀값을 받거나 저장하지 않습니다). 그 두 가지가 되면 4~7단계는 제가 실행하고 결과 주소를 커밋하겠습니다.
