import { CHANNELS } from "@/lib/channels";
import { currentLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";

export default async function About() {
  const locale = await currentLocale();
  const d = t(locale);
  const copy = {
    ko: [
      "사람은 어디서나 소원을 빈다. 종교가 달라도, 신을 믿지 않아도, 돌 하나를 올리고 동전 하나를 던지는 행동은 똑같다.",
      "Wish Engine은 세계 각지의 기복 의례를 하나씩 채널로 만든다. 채널을 고르고, 100원(약 $0.07)을 봉헌하고, 소원을 적는다. 결제가 확인되면 소원은 그 채널의 풍경 — 돌탑, 에마 걸이, 분수 — 의 일부가 된다.",
      "봉헌금은 소원에 무게를 더하는 장치다. 공짜 소원은 가볍다. 100원짜리 소원은 조금 덜 가볍다.",
    ],
    en: [
      "People wish everywhere. Different religions, or none at all — the gesture of placing a stone or tossing a coin is the same.",
      "Wish Engine turns each of the world's blessing rituals into a channel. Pick one, offer ₩100 (about $0.07), write your wish. Once payment clears, the wish becomes part of that channel's scene — the cairn, the ema rack, the fountain.",
      "The offering gives the wish weight. A free wish is light. A ₩100 wish is a little less light.",
    ],
    ja: [
      "人はどこでも願いをかける。宗教が違っても、何も信じなくても、石を置きコインを投げる仕草は同じだ。",
      "Wish Engine は世界各地の祈願儀礼をひとつずつチャンネルにする。チャンネルを選び、100ウォン（約$0.07）を捧げ、願いを書く。決済が確認されると、願いはそのチャンネルの風景——積み石、絵馬掛け、泉——の一部になる。",
      "お供えは願いに重みを与える仕掛けだ。無料の願いは軽い。100ウォンの願いは、少しだけ軽くない。",
    ],
    zh: [
      "人们在任何地方都会许愿。宗教不同，或者什么都不信，放一块石头、投一枚硬币的动作却是一样的。",
      "Wish Engine 把世界各地的祈福仪式各做成一个频道。选一个，献上100韩元（约$0.07），写下愿望。支付确认后，愿望就成为该频道景象——石塔、绘马架、许愿泉——的一部分。",
      "供奉让愿望有了分量。免费的愿望很轻。100韩元的愿望，稍微没那么轻。",
    ],
  }[locale];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 space-y-8">
      <h1 className="text-3xl font-bold">{d.about}</h1>
      {copy.map((p, i) => (
        <p key={i} className="text-lg text-[var(--muted)]">{p}</p>
      ))}
      <h2 className="text-xl font-semibold">{d.howItWorks}</h2>
      <ol className="list-decimal pl-6 space-y-2 text-[var(--muted)]">
        <li>{d.channels} → {CHANNELS.map((c) => c.emoji).join(" ")}</li>
        <li>{d.makeWish} → {d.offering} (₩100+)</li>
        <li>{d.payWith}: PayPal / Crypto</li>
        <li>{d.offered}</li>
      </ol>
    </div>
  );
}
