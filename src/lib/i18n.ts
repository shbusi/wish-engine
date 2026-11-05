import type { Locale } from "./channels";

export const LOCALES: Locale[] = ["ko", "en", "ja", "zh"];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABEL: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "中文",
};

const dict = {
  ko: {
    tagline: "인류 공통의 기복 문화를 한 곳에",
    heroTitle: "소원은 어디서나 빌 수 있다",
    heroBody:
      "돌탑, 에마, 분수의 동전, 풍등. 세상 모든 문화에는 소원을 비는 방식이 있다. 채널을 고르고, 100원을 올리고, 소원을 빌어라.",
    totalWishes: "지금까지 올려진 소원",
    channels: "채널",
    recentWishes: "방금 올라온 소원",
    makeWish: "소원 빌기",
    yourWish: "당신의 소원",
    wishPlaceholder: "이루어지길 바라는 것을 적어주세요 (280자 이내)",
    yourName: "이름 (선택)",
    namePlaceholder: "익명",
    offering: "봉헌",
    offeringHint: "최소 100원. 소원 한 개당 한 번.",
    payWith: "결제 수단",
    makePublic: "소원 벽에 공개",
    submit: "봉헌하고 소원 빌기",
    submitting: "준비 중…",
    anonymous: "익명",
    status: {
      PENDING: "결제 대기 중",
      OFFERED: "봉헌 완료",
      FAILED: "결제 실패",
      REFUNDED: "환불됨",
    },
    offered: "소원이 올라갔습니다",
    offeredBody: "당신의 소원은 이제 채널의 일부입니다.",
    pendingBody: "결제가 확인되면 소원이 올라갑니다. 이 페이지를 새로고침하세요.",
    backToChannel: "채널로 돌아가기",
    share: "공유하기",
    about: "소개",
    howItWorks: "어떻게 작동하나요",
    provider: { mock: "테스트 결제", paypal: "PayPal", crypto: "암호화폐" },
    mockPayTitle: "테스트 결제",
    mockPayBody: "개발용 결제 화면입니다. 실제 돈이 오가지 않습니다.",
    mockPayConfirm: "결제 완료 처리",
    mockPayFail: "결제 실패 처리",
    errors: {
      tooShort: "소원이 너무 짧습니다.",
      tooLong: "280자를 넘었습니다.",
      rate: "너무 자주 시도하고 있습니다. 잠시 후 다시 시도해주세요.",
      generic: "문제가 발생했습니다. 다시 시도해주세요.",
    },
    moreWishes: "더 보기",
    noWishes: "아직 아무도 소원을 빌지 않았습니다. 첫 번째가 되어보세요.",
    stackedSoFar: "지금까지",
    thisWeek: "이번 주",
    todayCount: "오늘",
    origin: "유래",
    allChannels: "모든 채널",
  },
  en: {
    tagline: "Every culture's way of asking, in one place",
    heroTitle: "Wishes belong to everyone",
    heroBody:
      "Stone cairns, ema plaques, coins in a fountain, sky lanterns. Every culture on earth has a ritual for asking. Pick a channel, offer ₩100, and make your wish.",
    totalWishes: "wishes offered so far",
    channels: "Channels",
    recentWishes: "Just offered",
    makeWish: "Make a wish",
    yourWish: "Your wish",
    wishPlaceholder: "What do you hope for? (up to 280 characters)",
    yourName: "Name (optional)",
    namePlaceholder: "Anonymous",
    offering: "Offering",
    offeringHint: "Minimum ₩100. One offering, one wish.",
    payWith: "Pay with",
    makePublic: "Show on the public wall",
    submit: "Offer & make the wish",
    submitting: "Preparing…",
    anonymous: "Anonymous",
    status: {
      PENDING: "Awaiting payment",
      OFFERED: "Offered",
      FAILED: "Payment failed",
      REFUNDED: "Refunded",
    },
    offered: "Your wish is up",
    offeredBody: "It is now part of the channel.",
    pendingBody: "Once payment is confirmed your wish will appear. Refresh this page.",
    backToChannel: "Back to channel",
    share: "Share",
    about: "About",
    howItWorks: "How it works",
    provider: { mock: "Test payment", paypal: "PayPal", crypto: "Crypto" },
    mockPayTitle: "Test payment",
    mockPayBody: "Development-only checkout. No real money moves.",
    mockPayConfirm: "Mark as paid",
    mockPayFail: "Mark as failed",
    errors: {
      tooShort: "Your wish is too short.",
      tooLong: "That is over 280 characters.",
      rate: "Too many attempts. Please wait a moment.",
      generic: "Something went wrong. Please try again.",
    },
    moreWishes: "Load more",
    noWishes: "No one has wished here yet. Be the first.",
    stackedSoFar: "so far",
    thisWeek: "this week",
    todayCount: "today",
    origin: "Origin",
    allChannels: "All channels",
  },
  ja: {
    tagline: "世界中の祈願文化を、ひとつの場所に",
    heroTitle: "願いは誰のものでもある",
    heroBody:
      "積み石、絵馬、泉のコイン、天燈。地球上のすべての文化に、願うための儀式がある。チャンネルを選び、100ウォンを捧げ、願いをかけよう。",
    totalWishes: "これまでに捧げられた願い",
    channels: "チャンネル",
    recentWishes: "いま捧げられた願い",
    makeWish: "願いをかける",
    yourWish: "あなたの願い",
    wishPlaceholder: "叶えたいことを書いてください（280文字まで）",
    yourName: "名前（任意）",
    namePlaceholder: "匿名",
    offering: "お供え",
    offeringHint: "最低100ウォン。ひとつのお供えにひとつの願い。",
    payWith: "支払い方法",
    makePublic: "公開の壁に表示する",
    submit: "お供えして願う",
    submitting: "準備中…",
    anonymous: "匿名",
    status: {
      PENDING: "支払い待ち",
      OFFERED: "奉納済み",
      FAILED: "支払い失敗",
      REFUNDED: "返金済み",
    },
    offered: "願いが届きました",
    offeredBody: "あなたの願いはチャンネルの一部になりました。",
    pendingBody: "支払いが確認されると願いが表示されます。ページを更新してください。",
    backToChannel: "チャンネルへ戻る",
    share: "共有",
    about: "について",
    howItWorks: "仕組み",
    provider: { mock: "テスト決済", paypal: "PayPal", crypto: "暗号資産" },
    mockPayTitle: "テスト決済",
    mockPayBody: "開発用の決済画面です。実際のお金は動きません。",
    mockPayConfirm: "支払い済みにする",
    mockPayFail: "失敗にする",
    errors: {
      tooShort: "願いが短すぎます。",
      tooLong: "280文字を超えています。",
      rate: "試行回数が多すぎます。少し待ってください。",
      generic: "問題が発生しました。もう一度お試しください。",
    },
    moreWishes: "もっと見る",
    noWishes: "まだ誰も願っていません。最初の一人になりましょう。",
    stackedSoFar: "累計",
    thisWeek: "今週",
    todayCount: "今日",
    origin: "由来",
    allChannels: "すべてのチャンネル",
  },
  zh: {
    tagline: "把全世界的祈福文化放在一起",
    heroTitle: "愿望属于每一个人",
    heroBody:
      "石塔、绘马、泉中硬币、天灯。地球上每种文化都有祈愿的仪式。选择一个频道，献上100韩元，许下你的愿望。",
    totalWishes: "至今已献上的愿望",
    channels: "频道",
    recentWishes: "刚刚献上",
    makeWish: "许愿",
    yourWish: "你的愿望",
    wishPlaceholder: "写下你希望实现的事（280字以内）",
    yourName: "名字（可选）",
    namePlaceholder: "匿名",
    offering: "供奉",
    offeringHint: "最低100韩元。一次供奉，一个愿望。",
    payWith: "支付方式",
    makePublic: "显示在公开许愿墙",
    submit: "供奉并许愿",
    submitting: "准备中…",
    anonymous: "匿名",
    status: {
      PENDING: "等待支付",
      OFFERED: "已供奉",
      FAILED: "支付失败",
      REFUNDED: "已退款",
    },
    offered: "你的愿望已献上",
    offeredBody: "它现在是这个频道的一部分。",
    pendingBody: "支付确认后愿望将会显示。请刷新本页。",
    backToChannel: "返回频道",
    share: "分享",
    about: "关于",
    howItWorks: "如何运作",
    provider: { mock: "测试支付", paypal: "PayPal", crypto: "加密货币" },
    mockPayTitle: "测试支付",
    mockPayBody: "仅供开发的支付页面，不会产生真实交易。",
    mockPayConfirm: "标记为已支付",
    mockPayFail: "标记为失败",
    errors: {
      tooShort: "愿望太短了。",
      tooLong: "超过了280个字符。",
      rate: "尝试太频繁，请稍后再试。",
      generic: "出了点问题，请重试。",
    },
    moreWishes: "加载更多",
    noWishes: "还没有人在这里许愿。做第一个吧。",
    stackedSoFar: "累计",
    thisWeek: "本周",
    todayCount: "今天",
    origin: "起源",
    allChannels: "所有频道",
  },
} as const;

export type Dict = (typeof dict)["en"];

export function t(locale: Locale): Dict {
  return (dict[locale] ?? dict.en) as Dict;
}

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as string[]).includes(x);
}

/** Pick the best locale from an Accept-Language header. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const parts = acceptLanguage
    .split(",")
    .map((p) => p.trim().split(";")[0].toLowerCase())
    .filter(Boolean);
  for (const p of parts) {
    const base = p.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
