import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { currentLocale } from "@/lib/locale-server";
import { getChannel } from "@/lib/channels";
import { relicName, RARITY_STYLE, type Rarity } from "@/lib/relics";
import { settleDueAuctions } from "@/lib/auctions";

export const dynamic = "force-dynamic";

export default async function AuctionsPage() {
  await settleDueAuctions();
  const locale = await currentLocale();
  const d = t(locale);
  const [live, closed] = await Promise.all([
    prisma.auction.findMany({
      where: { status: "OPEN" },
      orderBy: { endsAt: "asc" },
      include: { relic: { include: { wish: { select: { text: true, author: true } } } }, bids: { where: { status: "ACTIVE" }, orderBy: { credits: "desc" }, take: 1 } },
      take: 50,
    }),
    prisma.auction.findMany({
      where: { status: "SETTLED" },
      orderBy: { endsAt: "desc" },
      include: { relic: true },
      take: 10,
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-10">
      <div>
        <h1 className="text-3xl font-bold">🏺 {d.relic.auctions}</h1>
        <p className="text-sm text-[var(--muted)] mt-1">{d.relic.odds} · {d.relic.fee}</p>
      </div>

      <section>
        <h2 className="font-semibold mb-3">{d.relic.live}</h2>
        {live.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{d.relic.noAuctions}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((a) => {
              const c = getChannel(a.relic.channelId)!;
              const rs = RARITY_STYLE[a.relic.rarity as Rarity];
              const top = a.bids[0];
              return (
                <a key={a.id} href={`/auctions/${a.id}`} className="card p-4 space-y-2 hover:border-white/25" style={{ borderColor: `${rs.color}66` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{c.emoji}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${rs.color}22`, color: rs.color }}>✦ {rs.label[locale]}</span>
                  </div>
                  <div className="font-semibold">{relicName(a.relic.channelId, a.relic.rarity as Rarity, locale)}</div>
                  <div className="text-xs text-[var(--muted)] line-clamp-2">“{a.relic.wish.text}” — {a.relic.wish.author || d.anonymous}</div>
                  <div className="flex justify-between text-sm pt-1">
                    <span>{top ? `${d.relic.currentBid} 🎟️ ${top.credits}` : `${d.relic.minBid} 🎟️ ${a.minBidCredits}`}</span>
                    <span className="text-[var(--muted)]">{d.relic.endsIn} {timeLeft(a.endsAt)}</span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="font-semibold mb-3">{d.relic.closed}</h2>
          <ul className="card divide-y divide-white/10">
            {closed.map((a) => {
              const c = getChannel(a.relic.channelId)!;
              return (
                <li key={a.id} className="flex justify-between px-4 py-2 text-sm">
                  <a href={`/auctions/${a.id}`}>{c.emoji} {relicName(a.relic.channelId, a.relic.rarity as Rarity, locale)}</a>
                  <span>🎟️ {a.winningBidCredits}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

export function timeLeft(endsAt: Date): string {
  const ms = endsAt.getTime() - Date.now();
  if (ms <= 0) return "0m";
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
