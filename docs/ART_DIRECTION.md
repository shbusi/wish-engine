# Wish Engine — 아트 디렉션 & 생성 파이프라인

현재 장면은 코드로 그린 SVG(`src/components/RitualScene.tsx`)와 CSS 토큰(`src/lib/card.tsx`)입니다.
이 문서는 그것을 "진짜 아트"로 올리는 방법과, 아트가 코드에 꽂히는 자리를 정의합니다.

> 기준일 2026-11. 모델 이름과 버전은 빠르게 바뀝니다. 아래는 **선택 기준**으로 읽고, 실제
> 도입 시점의 최신 버전으로 치환하세요.

---

## 0. 아트가 꽂히는 자리 (코드 연결점)

`public/art/manifest.json` 하나로 교체됩니다. 비어 있으면 지금 그대로, 채우면 그 채널만 바뀝니다.

```jsonc
{
  "version": 1,
  "channels": {
    "stone-cairn": {
      "background": "/art/stone-cairn/bg.webp",          // 1920×960 장면 플레이트 (SVG 오브젝트 아래에 깔림)
      "backgroundLoop": "/art/stone-cairn/bg-loop.mp4",   // 선택: 6–10초 루프, 채널 히어로용
      "objects": {                                        // 1024×1024 투명 스프라이트, 등급별
        "COMMON": "/art/stone-cairn/stone.webp",
        "UNCOMMON": "/art/stone-cairn/stone-moss.webp",
        "RARE": "/art/stone-cairn/stone-jade.webp",
        "LEGENDARY": "/art/stone-cairn/stone-meteor.webp"
      },
      "model": "/art/stone-cairn/stone.glb"               // 선택: 3D 단계용
    }
  }
}
```

| 슬롯 | 쓰이는 곳 | 없으면 |
|---|---|---|
| `background` | 채널 페이지·카드·홈 그리드의 장면 바닥 | 코드 SVG 배경 |
| `objects[rarity]` | 소원 카드·드롭 영상의 토큰, 장면 위 오브젝트 | CSS/SVG 도형 |
| `backgroundLoop` | 채널 히어로 (향후) | 정지 플레이트 |
| `model` | 3D 장면 (3단계) | 2D |

스키마: `public/art/manifest.schema.json`. 로더: `src/lib/art.ts`.

---

## 1. 스타일 바이블 — "밤의 제단"

12개 문화를 한 제품으로 묶는 건 **조명과 팔레트**이지 그림체가 아닙니다.

- **시간대**: 항상 해 진 직후~밤. 모든 채널이 같은 하늘을 공유합니다 (`#0b0a12` → 채널 hue로 번지는 라디얼).
- **광원**: 장면당 따뜻한 점광원 하나 (촛불, 풍등, 달빛). 오브젝트는 그 빛을 받아 **림라이트**.
- **재질**: 손으로 만진 것 — 돌의 결, 나무판의 붓자국, 종이의 구김. 플라스틱 광택 금지.
- **카메라**: 눈높이 살짝 아래, 35mm, 얕은 심도. 오브젝트가 주인공, 배경은 흐림.
- **표현 수위**: **양식화(stylized realism)**. 사진 같은 성지 재현은 하지 않습니다. 특히 서쪽 벽·사원 등 종교
  공간은 "그런 느낌의 벽", "그런 느낌의 나무"로 멈춥니다. 성스러운 문자·상징을 그대로 그리지 않습니다.
- **등급 언어**: 일반=무광, 희귀=이끼/결 같은 자연 변주, 영물=금·옥 같은 귀한 재질, 전설=빛 자체가 재질 (달빛, 초신성).
  색은 코드의 `RARITY_STYLE`과 일치: 희귀 `#5ad18f`, 영물 `#f0b35b`, 전설 `#c084fc`.

---

## 2. 2D 파이프라인 (1단계, 가장 먼저)

**목표물**: 배경 플레이트 12장 + 오브젝트 스프라이트 48장(12×4등급). 총 60장. 한 사람이 1~2주.

### 모델 선택
| 용도 | 1순위 | 대안 | 이유 |
|---|---|---|---|
| 스타일 통일된 최종 이미지 | **Flux dev + 자체 LoRA** | SDXL + LoRA | 12채널이 "한 작가" 느낌이어야 함. LoRA 없이는 매 장면 톤이 흔들림 |
| 구도 탐색·무드보드 | Midjourney | Ideogram | 빠르고 미적 기본값이 높음. 단, 라이선스·재현성 때문에 최종본엔 안 씀 |
| 구도 고정·재생성 | Flux/SDXL + **ControlNet(depth/canny)** | — | 돌탑의 실루엣, 에마 걸이의 격자 같은 레이아웃을 코드와 맞춰야 함 |
| 투명 스프라이트 추출 | **BiRefNet / RMBG-2** | SAM2 | 배경 제거 품질이 스프라이트 품질을 결정 |
| 업스케일 | Real-ESRGAN / Magnific | — | 1024 생성 → 2048 업스케일 후 다운샘플 |

### LoRA 학습
1. 무드보드로 **40~60장** 선별 (실제 촬영 + 승인된 생성물 혼합). "밤의 제단" 규칙을 만족하는 것만.
2. 캡션은 짧고 일관되게: `wishengine style, night altar, warm single light, stylized realism, <subject>`.
3. Flux dev LoRA, rank 16, 1500~2500 steps. 과적합 신호(배경이 똑같이 나옴)가 보이면 중단.
4. 산출물은 `wishengine-style-v1.safetensors`로 버전 관리. **모든 최종 이미지는 이 LoRA로만** 뽑습니다.

### 프롬프트 템플릿
```
wishengine style, night altar, warm single light, stylized realism,
<channel subject>, <material>, rim light, shallow depth of field, 35mm,
no text, no people, no religious symbols
```
채널 subject 예시:
- stone-cairn: `a stack of river stones on a mountain pass, moss, mist`
- ema: `rows of small wooden plaques hanging on a wooden rack, shrine courtyard, lantern light`
- wishing-fountain: `baroque stone fountain basin, coins glinting under water, dusk`
- sky-lantern: `dozens of paper lanterns rising into a deep blue night sky`
- ribbon-tree: `old banyan tree with hundreds of red cloth strips, moonlight`
- prayer-wall: `ancient limestone wall, folded paper notes in the cracks, soft lamplight` (문자·상징 없음)
- votive-candle: `tiered iron candle rack, dozens of small flames, cathedral shadow`
- krathong: `banana-leaf floating baskets with candles drifting on a dark river`
- bonfim-ribbon: `colorful ribbons tied to a wrought-iron gate, Bahia afternoon fading to dusk`
- prayer-flag: `five-color flags on a rope snapping in Himalayan wind, snow peaks, blue hour`
- diya: `clay oil lamps with marigolds floating on the Ganges at night`
- shooting-star: `a meteor streak over a quiet field, dandelions, 11:11`

등급 변주는 **같은 시드에 재질 단어만 교체**: `river stone` → `moss-covered stone` → `jade stone` → `glowing meteorite shard`.

### 품질 게이트 (체크리스트)
- [ ] 12장 배경을 한 줄로 늘어놓았을 때 같은 하늘, 같은 광원 온도인가
- [ ] 오브젝트 스프라이트는 1024², 투명, 가장자리에 헤일로 없음
- [ ] 텍스트·얼굴·종교 상징 없음 (생성 모델은 자꾸 넣음. 네거티브 프롬프트 + 수동 검수)
- [ ] 등급 4단계가 **썸네일 크기(80px)에서도** 구분되는가 — 카드와 숏폼에서 그 크기로 보임

---

## 3. 모션 (2단계)

드롭 영상(`src/lib/video.tsx`)은 **코드 애니메이션**입니다. 타임라인은 `video-timeline.ts`에 있고,
오브젝트만 스프라이트로 바꾸면 아트 퀄리티가 그대로 올라갑니다. 생성형 영상 모델은 여기서
**배경 루프**에만 씁니다.

| 용도 | 1순위 | 대안 | 비고 |
|---|---|---|---|
| 채널 배경 6~10초 루프 (image→video) | **Kling 2.x** / Runway Gen-4 | Wan 2.x (자체 호스팅) | 1단계 배경 플레이트를 입력으로. "camera static, lanterns drifting, embers" 같은 **미세 모션만** |
| 소리 있는 티저 (text→video+audio) | **Veo 3** | — | 쇼츠용 티저 광고 소재. 제품 UI엔 안 들어감 |
| 드롭 순간 임팩트 | 코드 (현재) | 파티클 스프라이트 시트 | 생성 모델로 "딱 그 순간"을 통제하기 어려움. 코드가 정확함 |

**숏폼 공식**과의 연결: 리서치에서 반복된 특징은 "첫 3초의 열린 질문", "불가능해 보이는데 진짜",
"자리를 잡는 순간의 긴장 해소", "되감기 쉬운 루프"였습니다. 드롭 영상의 타임라인이 정확히 그 구조입니다
(0.9초까지 대기 → 낙하 → 2.2초 정착 + 플래시 → 공개). 아트가 바뀌어도 이 박자는 유지하세요.

---

## 4. 3D (3단계, 선택)

2D로 충분히 멀리 갑니다. 3D는 **인터랙션**(돌을 직접 올려놓기, 등을 손으로 띄우기)이 필요해질 때만.

| 용도 | 1순위 | 대안 |
|---|---|---|
| 오브젝트 image→3D | **Hunyuan3D 2.x** (오픈) | Tripo / Meshy (API) |
| 리토폴·베이크 | Blender (수동 1시간/개) | Instant Meshes |
| 런타임 | Three.js / React Three Fiber, GLB + KTX2 텍스처 | — |
| 실제 장소 재현 | Gaussian Splat 촬영 (Luma 등) | — |

- 2D 스프라이트와 동일한 LoRA 스타일 이미지를 **입력**으로 넣어야 2D/3D가 한 세계로 보입니다.
- 폴리곤 예산: 오브젝트 하나 ≤ 8k tris, 텍스처 1k. 모바일 쇼츠 유입이 주력이라 WebGL 예산이 빠듯합니다.
- 먼저 할 것은 **2.5D 패럴랙스**(배경 3레이어 + 오브젝트 1레이어)입니다. 3D의 80% 느낌을 10%의 비용으로 냅니다.

---

## 5. 우선순위와 비용 감

| 단계 | 산출물 | 공수 | 생성 비용(대략) |
|---|---|---|---|
| 1 | 배경 12 + 스프라이트 48, LoRA v1 | 1~2주, 1인 | GPU 임대 수십 달러 + API 수십 달러 |
| 2 | 배경 루프 12개 | 2~3일 | 영상 API 클립당 $0.5~3 × 재시도 |
| 3 | 2.5D 패럴랙스 → GLB 12개 | 2~4주 | 3D API 또는 자체 GPU |

가장 큰 레버는 1단계의 **LoRA 일관성**입니다. 그게 흔들리면 뒤는 다 흔들립니다.

---

## 6. 권리·안전

- 학습·생성에 **실제 신자 사진, 특정 사원의 상표성 있는 건물, 경전 문자**를 쓰지 않습니다.
- 생성물은 상업 사용 가능한 라이선스의 모델만 (Flux dev는 비상업 조항이 있으므로 **Flux pro API 또는 라이선스 확인** 필수. SDXL은 자유).
- 모든 최종 에셋은 `public/art/<channel>/`에 두고 `manifest.json`에 등록. 출처와 생성 파라미터를 `public/art/<channel>/PROVENANCE.md`에 남깁니다.
