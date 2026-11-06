# X 고정 스레드 초안

원칙: 제품을 보여주고, 세일은 페이지가 설명하게 둔다. 트윗 본문에서 "사세요"라고 하지 않는다.
1번 트윗에는 반드시 영상(돌이 떨어져 쌓이는 30초 세로 클립)을 붙인다. 글만 있는 1번 트윗은 멈추게 하지 못한다.
각 트윗은 280자 이내. `{URL}`은 실제 주소로, `{HEIGHT}`·`{N}`은 게시 당일 숫자로 바꾼다.

---

## English (main account)

**1/**
Humans have stacked stones to make a wish for thousands of years. Korea, Tibet, Scotland, the Andes, Hawaii.

We built one tower for all of us. It's {HEIGHT} m tall right now and it never stops growing.

Stack yours → {URL}
[video: stones dropping onto the cairn, name engraving, height counter]

**2/**
How it works:
• write a wish, add your name, drop a stone
• one free stone a day, the next ones cost a few cents
• your name is carved into the stone, everyone sees it land
• the higher the tower, the more the world changes around it: meadow → above the clouds → the firmament

**3/**
Why people come back:
• the tower is one shared object. {N} people have placed a stone today.
• you can bless someone else's stone. They get told.
• you can seal a wish so only you can read it. The tower shows a wax seal.
• milestones: when the tower passes the clouds, everyone who stacked gets something.

**4/**
What's on-chain (Base):
• every stone can be an NFT (your wish stays private, only its hash is on-chain)
• pay in the stablecoin of your country: USDC, EURC, JPYC, BRZ …
• 50% of every stone sold is paid out to CAIRN stakers, in the same coin, in the same transaction

**5/**
The CAIRN token in one breath:
fixed 1B supply · no mint, no owner, no pause · team locked 24 months in OpenZeppelin vesting · sale with full refunds if the soft cap is missed.

Everything verifiable on the block explorer. Overview with live numbers: {URL}/investors

**6/**
What we're doing before any sale:
1. testnet rehearsal (now)
2. four weeks of public usage data
3. external audit
4. Base mainnet

Numbers go public first, token second. Follow the tower: {URL}

**7/ (daily reply template, post in the thread each day)**
Day {D}: the tower is {HEIGHT} m. +{N} stones today. {CITY} stacked the top stone.
[screenshot of the tower at today's height]

---

## 한국어 (국내 계정 또는 같은 계정의 인용 트윗)

**1/**
돌탑에 돌 하나 얹고 소원 비는 거, 우리만 하는 게 아닙니다. 티베트, 스코틀랜드, 안데스, 하와이도 합니다.

그래서 전 세계가 함께 쌓는 탑을 하나 만들었습니다. 지금 {HEIGHT} m, 계속 올라갑니다.

내 돌 올리기 → {URL}
[영상]

**2/**
이렇게 됩니다:
• 소원 쓰고, 이름 넣고, 돌 떨어뜨리기
• 하루 한 개 무료, 그다음은 몇백 원
• 이름이 돌에 새겨지고, 올라가는 순간을 모두가 봅니다
• 탑이 높아지면 풍경이 바뀝니다: 초원 → 구름 위 → 궁창

**3/**
다시 오게 되는 이유:
• 탑은 하나입니다. 오늘 {N}명이 돌을 올렸습니다.
• 남의 돌을 축복할 수 있고, 그 사람에게 알려집니다.
• 소원을 봉인하면 나만 읽을 수 있습니다. 탑에는 봉인 문양만 보입니다.
• 탑이 구름을 넘으면 쌓은 모두에게 무언가가 갑니다.

**4/**
온체인(Base):
• 돌 하나하나가 NFT가 될 수 있습니다 (소원은 비공개, 해시만 올라감)
• 내 나라 스테이블코인으로 결제: USDC, EURC, JPYC, BRZ …
• 팔린 돌의 50%가 같은 트랜잭션에서 같은 코인으로 CAIRN 스테이커에게 갑니다

**5/**
CAIRN 토큰 한 줄 요약:
10억 개 고정 · 추가 발행·오너·정지 없음 · 팀 물량 24개월 잠금 · 소프트캡 미달 시 전액 환불.

전부 탐색기에서 확인됩니다. 실시간 숫자와 함께: {URL}/investors?lang=ko

**6/**
세일 전에 하는 것:
1. 테스트넷 리허설 (지금)
2. 4주간 사용 데이터 공개
3. 외부 감사
4. Base 메인넷

숫자가 먼저, 토큰은 그다음입니다. 탑을 지켜봐 주세요: {URL}

**7/ (매일 스레드에 다는 답글 템플릿)**
{D}일째: 탑 {HEIGHT} m. 오늘 +{N}개. 맨 위 돌은 {CITY}에서 올라왔습니다.
[오늘 높이의 탑 스크린샷]

---

## 게시 체크리스트

- [ ] 1번 트윗 영상: 세로 9:16, 30초 이내, 자막 없이도 이해되게 (돌 떨어짐 → 이름 새겨짐 → 높이 숫자 오름)
- [ ] 프로필: 링크는 `{URL}`, 소개 한 줄은 2번 트윗 첫 줄
- [ ] `{URL}/investors`가 실제 숫자를 보여주는지 게시 직전에 확인 (0이 많으면 7일 뒤로 미루는 게 낫다)
- [ ] 계정 생성 후 1주일은 스레드 없이 7번 템플릿만 매일 올려 타임라인을 채운다
- [ ] Farcaster(Warpcast)에 같은 1번 트윗을 /base 채널에 올린다. Base 쪽 빌더·투자자는 거기 있다
- [ ] 개인 계정으로 "투자해 주세요"는 쓰지 않는다. 세일 설명은 페이지 안에만 둔다
