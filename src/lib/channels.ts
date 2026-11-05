/**
 * Channel registry — one channel per 기복 (blessing-seeking) ritual.
 *
 * Every culture on earth has a way of asking the universe for something:
 * stacking stones, tossing coins, tying ribbons, lighting lanterns.
 * Wish Engine turns each of those into a channel.
 */
export type Locale = "ko" | "en" | "ja" | "zh";

export type ChannelVisual =
  | "cairn"
  | "ema"
  | "fountain"
  | "lantern"
  | "ribbon-tree"
  | "wall"
  | "candle"
  | "krathong"
  | "bonfim"
  | "prayer-flag"
  | "star"
  | "diya";

export interface ChannelDef {
  id: string;
  visual: ChannelVisual;
  emoji: string;
  /** Region / origin, shown as a tag. */
  origin: string;
  /** Hue for the card accent. */
  hue: number;
  name: Record<Locale, string>;
  /** Imperative ritual action: "Stack a stone", "Toss a coin". */
  action: Record<Locale, string>;
  /** Short description of the ritual and where it comes from. */
  description: Record<Locale, string>;
  /** Unit noun used in counters: "stones", "coins". */
  unit: Record<Locale, string>;
}

export const CHANNELS: ChannelDef[] = [
  {
    id: "stone-cairn",
    visual: "cairn",
    emoji: "🪨",
    origin: "Korea · Tibet · Scotland",
    hue: 30,
    name: { ko: "돌탑", en: "Stone Cairn", ja: "積み石", zh: "许愿石塔" },
    action: { ko: "돌 하나 올리기", en: "Stack a stone", ja: "石を積む", zh: "叠一块石头" },
    unit: { ko: "개의 돌", en: "stones", ja: "個の石", zh: "块石头" },
    description: {
      ko: "산길 어귀, 절 입구, 서낭당 옆. 한국인은 오가며 돌 하나를 올리고 소원을 빈다. 무너지지 않게 조심스레 올리는 그 마음이 기도다.",
      en: "At mountain passes and temple gates, Koreans add one stone to the pile as they pass and make a wish. The care it takes not to topple the tower is the prayer itself.",
      ja: "峠や寺の入り口で、通りすがりに石をひとつ積んで願いをかける。崩さないよう慎重に置くその心が祈りになる。",
      zh: "在山口与寺门前，人们路过时放上一块石头许个愿。小心不让石塔倒下的那份心意，就是祈祷本身。",
    },
  },
  {
    id: "ema",
    visual: "ema",
    emoji: "🪵",
    origin: "Japan",
    hue: 25,
    name: { ko: "에마 (絵馬)", en: "Ema Plaque", ja: "絵馬", zh: "绘马" },
    action: { ko: "소원패 걸기", en: "Hang a plaque", ja: "絵馬を掛ける", zh: "挂一块绘马" },
    unit: { ko: "개의 에마", en: "plaques", ja: "枚の絵馬", zh: "块绘马" },
    description: {
      ko: "일본 신사에서는 작은 나무판에 소원을 적어 걸어둔다. 합격, 연애, 건강. 수백 장의 에마가 바람에 부딪히는 소리는 수백 개의 바람이다.",
      en: "At Shinto shrines, wishes are written on small wooden plaques and hung in rows. Exams, love, health. Hundreds of ema clacking in the wind are hundreds of hopes.",
      ja: "神社で小さな木の板に願いを書いて奉納する。合格、恋愛、健康。風に揺れる何百もの絵馬は、何百もの願いそのもの。",
      zh: "在日本神社，人们把心愿写在小木牌上挂起来。升学、恋爱、健康。风中碰撞的数百块绘马，就是数百个愿望。",
    },
  },
  {
    id: "wishing-fountain",
    visual: "fountain",
    emoji: "🪙",
    origin: "Rome · worldwide",
    hue: 200,
    name: { ko: "소원의 분수", en: "Wishing Fountain", ja: "願いの泉", zh: "许愿泉" },
    action: { ko: "동전 던지기", en: "Toss a coin", ja: "コインを投げる", zh: "投一枚硬币" },
    unit: { ko: "개의 동전", en: "coins", ja: "枚のコイン", zh: "枚硬币" },
    description: {
      ko: "로마 트레비 분수에는 매일 수천 유로가 던져진다. 등을 돌리고 오른손으로 왼쪽 어깨 너머로. 우물과 분수에 동전을 던지는 풍습은 전 세계에 있다.",
      en: "Thousands of euros land in Rome's Trevi Fountain every day — back turned, right hand over left shoulder. Tossing coins into wells and fountains is a custom found on every continent.",
      ja: "ローマのトレビの泉には毎日数千ユーロが投げ込まれる。背を向け、右手で左肩越しに。泉や井戸にコインを投げる風習は世界中にある。",
      zh: "罗马许愿池每天都会收到数千欧元。背对泉水，用右手从左肩上方抛出。往井和泉水里投硬币的习俗遍布全球。",
    },
  },
  {
    id: "sky-lantern",
    visual: "lantern",
    emoji: "🏮",
    origin: "Taiwan · Thailand · China",
    hue: 15,
    name: { ko: "풍등", en: "Sky Lantern", ja: "天燈", zh: "天灯" },
    action: { ko: "풍등 띄우기", en: "Release a lantern", ja: "天燈を上げる", zh: "放一盏天灯" },
    unit: { ko: "개의 풍등", en: "lanterns", ja: "個の天燈", zh: "盏天灯" },
    description: {
      ko: "대만 핑시, 태국 치앙마이의 밤하늘. 종이 등에 소원을 적고 불을 붙이면 등은 하늘로 오른다. 소원이 하늘에 닿는다는 가장 직관적인 은유.",
      en: "The night skies over Pingxi and Chiang Mai. Write your wish on a paper lantern, light it, and let it rise. The most literal metaphor for a wish reaching heaven.",
      ja: "台湾・平渓やチェンマイの夜空。紙の灯籠に願いを書き、火を灯して空へ放つ。願いが天に届くという最も直感的な比喩。",
      zh: "平溪与清迈的夜空。把愿望写在纸灯上，点燃，让它升起。愿望抵达天际最直观的隐喻。",
    },
  },
  {
    id: "ribbon-tree",
    visual: "ribbon-tree",
    emoji: "🎀",
    origin: "Hong Kong · Türkiye · Ireland",
    hue: 350,
    name: { ko: "소원 나무", en: "Wishing Tree", ja: "願いの木", zh: "许愿树" },
    action: { ko: "리본 묶기", en: "Tie a ribbon", ja: "リボンを結ぶ", zh: "系一条红布" },
    unit: { ko: "개의 리본", en: "ribbons", ja: "本のリボン", zh: "条红布" },
    description: {
      ko: "홍콩 람춘의 허원수(許願樹), 튀르키예의 딜렉 아아즈, 아일랜드의 클루티 트리. 나무에 천을 묶어 소원을 거는 풍습은 유라시아 전체에 퍼져 있다.",
      en: "Lam Tsuen's wishing tree in Hong Kong, Türkiye's dilek ağacı, Ireland's clootie trees. Tying cloth to a tree to hang a wish is a custom spanning all of Eurasia.",
      ja: "香港・林村の許願樹、トルコのディレク・アーチ、アイルランドのクルーティ・ツリー。木に布を結んで願いを託す風習はユーラシア全域に広がる。",
      zh: "香港林村许愿树、土耳其的许愿树、爱尔兰的布条树。在树上系布许愿的习俗遍布整个欧亚大陆。",
    },
  },
  {
    id: "prayer-wall",
    visual: "wall",
    emoji: "🧱",
    origin: "Jerusalem · worldwide",
    hue: 40,
    name: { ko: "소원의 벽", en: "Wall of Notes", ja: "願いの壁", zh: "许愿墙" },
    action: { ko: "쪽지 끼워 넣기", en: "Slip a note into the wall", ja: "紙片を壁に差し込む", zh: "把纸条塞进墙缝" },
    unit: { ko: "장의 쪽지", en: "notes", ja: "枚の紙片", zh: "张纸条" },
    description: {
      ko: "예루살렘 서쪽 벽의 돌 틈에는 매년 백만 장이 넘는 쪽지가 꽂힌다. 접어서, 조용히, 아무도 읽지 않을 말을 벽에 맡기는 행위.",
      en: "Over a million folded notes are tucked into the cracks of Jerusalem's Western Wall each year. Folding a message no one will read and entrusting it to stone.",
      ja: "エルサレムの嘆きの壁の石の隙間には、毎年百万枚を超える紙片が差し込まれる。誰も読まない言葉を折りたたみ、静かに壁に託す行為。",
      zh: "每年有超过一百万张折叠的纸条被塞进耶路撒冷西墙的石缝。把无人会读的话折好，静静托付给石头。",
    },
  },
  {
    id: "votive-candle",
    visual: "candle",
    emoji: "🕯️",
    origin: "Europe · Latin America · worldwide",
    hue: 45,
    name: { ko: "촛불 봉헌", en: "Votive Candle", ja: "奉献のろうそく", zh: "许愿烛" },
    action: { ko: "초 켜기", en: "Light a candle", ja: "ろうそくを灯す", zh: "点一支蜡烛" },
    unit: { ko: "개의 촛불", en: "candles", ja: "本のろうそく", zh: "支蜡烛" },
    description: {
      ko: "성당 구석의 촛대, 멕시코의 벨라도라, 한국의 촛불 기도. 작은 불꽃 하나를 남기고 돌아서는 행위는 종교를 가리지 않는다.",
      en: "The candle rack in a cathedral corner, Mexican veladoras, Korean candle prayers. Leaving one small flame behind and walking away belongs to no single faith.",
      ja: "大聖堂の片隅のろうそく台、メキシコのベラドーラ、韓国の灯明祈願。小さな炎をひとつ残して立ち去る行為は、宗教を選ばない。",
      zh: "教堂角落的烛台，墨西哥的祈愿蜡烛，韩国的烛光祈祷。留下一簇小小的火焰转身离去，这不属于任何单一信仰。",
    },
  },
  {
    id: "krathong",
    visual: "krathong",
    emoji: "🪷",
    origin: "Thailand · Laos",
    hue: 300,
    name: { ko: "끄라통", en: "Krathong", ja: "クラトン", zh: "水灯" },
    action: { ko: "끄라통 띄우기", en: "Float a krathong", ja: "クラトンを流す", zh: "放一盏水灯" },
    unit: { ko: "개의 끄라통", en: "krathongs", ja: "個のクラトン", zh: "盏水灯" },
    description: {
      ko: "태국 러이끄라통 축제. 바나나 잎으로 만든 작은 배에 촛불과 꽃을 싣고 강에 띄운다. 나쁜 것은 흘려보내고 좋은 것을 빈다.",
      en: "Thailand's Loi Krathong festival. A small boat of banana leaves carries a candle and flowers down the river, floating away misfortune and carrying a wish.",
      ja: "タイのロイクラトン祭。バナナの葉で作った小舟にろうそくと花を載せて川に流す。悪いものを流し、良いものを願う。",
      zh: "泰国水灯节。用香蕉叶做成的小船载着蜡烛与鲜花顺流而下，送走霉运，许下心愿。",
    },
  },
  {
    id: "bonfim-ribbon",
    visual: "bonfim",
    emoji: "🧵",
    origin: "Brazil",
    hue: 120,
    name: { ko: "봉핑 리본", en: "Bonfim Ribbon", ja: "ボンフィンのリボン", zh: "邦芬彩带" },
    action: { ko: "매듭 세 번 묶기", en: "Tie three knots", ja: "結び目を三つ作る", zh: "打三个结" },
    unit: { ko: "개의 리본", en: "ribbons", ja: "本のリボン", zh: "条彩带" },
    description: {
      ko: "브라질 바이아의 봉핑 교회. 손목에 리본을 묶으며 매듭마다 소원 하나. 리본이 저절로 끊어질 때 소원이 이루어진다고 믿는다.",
      en: "Salvador da Bahia's Bonfim church. A ribbon is tied around the wrist with three knots, one wish per knot. When it finally wears through and falls off, the wishes come true.",
      ja: "ブラジル・バイーアのボンフィン教会。手首にリボンを結び、結び目ごとに願いをひとつ。自然に切れた時に願いが叶うと信じられている。",
      zh: "巴西巴伊亚的邦芬教堂。在手腕上系一条彩带，打三个结，每个结许一个愿。当彩带自然断落时，愿望就会实现。",
    },
  },
  {
    id: "prayer-flag",
    visual: "prayer-flag",
    emoji: "🏳️‍🌈",
    origin: "Tibet · Nepal · Bhutan",
    hue: 210,
    name: { ko: "룽다 (기도 깃발)", en: "Prayer Flag", ja: "タルチョ", zh: "经幡" },
    action: { ko: "깃발 걸기", en: "Hang a flag", ja: "旗を掛ける", zh: "挂一面经幡" },
    unit: { ko: "장의 깃발", en: "flags", ja: "枚の旗", zh: "面经幡" },
    description: {
      ko: "히말라야 고갯길에 펄럭이는 오색 깃발. 바람이 깃발을 스칠 때마다 적힌 기원이 세상으로 퍼진다고 믿는다. 깃발은 낡을수록 좋다.",
      en: "Five-colored flags snapping on Himalayan passes. Each time the wind touches a flag, the blessing written on it is carried into the world. The more faded, the better.",
      ja: "ヒマラヤの峠にはためく五色の旗。風が旗に触れるたび、書かれた祈りが世界へ運ばれると信じられている。色褪せるほど良い。",
      zh: "在喜马拉雅山口飘扬的五色旗帜。每当风吹过经幡，上面的祈愿便被带向世界。越褪色越好。",
    },
  },
  {
    id: "diya",
    visual: "diya",
    emoji: "🪔",
    origin: "India · Nepal",
    hue: 35,
    name: { ko: "디야 등불", en: "Floating Diya", ja: "ディヤの灯", zh: "河灯" },
    action: { ko: "등불 띄우기", en: "Float a diya", ja: "ディヤを流す", zh: "放一盏河灯" },
    unit: { ko: "개의 등불", en: "lamps", ja: "個の灯", zh: "盏河灯" },
    description: {
      ko: "바라나시의 갠지스 강. 흙으로 빚은 작은 등잔에 꽃과 불을 담아 강에 띄우는 딥단(deepdaan). 흐르는 물에 소원을 싣는다.",
      en: "The Ganges at Varanasi. Deepdaan: a small clay lamp holding a flame and marigolds, set adrift on the river so the current carries the wish.",
      ja: "バラナシのガンジス川。素焼きの小さな灯に火と花を載せて川へ流すディープダーン。流れる水に願いを託す。",
      zh: "瓦拉纳西的恒河。Deepdaan：在小陶灯里盛上火焰与万寿菊，放入河中，让水流带走心愿。",
    },
  },
  {
    id: "shooting-star",
    visual: "star",
    emoji: "🌠",
    origin: "Everywhere",
    hue: 260,
    name: { ko: "별똥별", en: "Shooting Star", ja: "流れ星", zh: "流星" },
    action: { ko: "별에 빌기", en: "Wish on a star", ja: "星に願う", zh: "对流星许愿" },
    unit: { ko: "개의 별", en: "stars", ja: "個の星", zh: "颗星" },
    description: {
      ko: "종교도, 사원도 필요 없다. 별똥별, 민들레 홀씨, 생일 촛불, 11시 11분. 신을 믿지 않는 사람도 소원은 빈다.",
      en: "No religion, no temple required. Shooting stars, dandelion seeds, birthday candles, 11:11. Even people who believe in nothing still make wishes.",
      ja: "宗教も寺院もいらない。流れ星、タンポポの綿毛、誕生日のろうそく、11時11分。何も信じない人でも願いごとはする。",
      zh: "不需要宗教，也不需要庙宇。流星、蒲公英、生日蜡烛、11:11。即使什么都不信的人，也会许愿。",
    },
  },
];

export const CHANNEL_MAP: Record<string, ChannelDef> = Object.fromEntries(
  CHANNELS.map((c) => [c.id, c]),
);

export function getChannel(id: string): ChannelDef | undefined {
  return CHANNEL_MAP[id];
}
