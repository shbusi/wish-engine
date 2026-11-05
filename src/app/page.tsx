import { CHANNELS } from "@/lib/channels";
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { currentLocale } from "@/lib/locale-server";
import { listOfferedWishes } from "@/lib/wishes";
import { ChannelCard } from "@/components/ChannelCard";
import { WishWall } from "@/components/WishWall";

export const dynamic = "force-dynamic";

export default async function Home() {
  const locale = await currentLocale();
  const d = t(locale);
  const [rows, recent] = await Promise.all([
    prisma.channel.findMany({ select: { id: true, wishCount: true } }),
    listOfferedWishes({ take: 8 }),
  ]);
  const counts = Object.fromEntries(rows.map((r) => [r.id, r.wishCount]));
  const total = rows.reduce((a, r) => a + r.wishCount, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-12">
      <section className="text-center space-y-4">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">{d.heroTitle}</h1>
        <p className="mx-auto max-w-2xl text-[var(--muted)] text-lg">{d.heroBody}</p>
        <div className="inline-flex items-baseline gap-2 card px-5 py-3">
          <span className="text-3xl font-bold text-[var(--accent)]">{total.toLocaleString(locale)}</span>
          <span className="text-sm text-[var(--muted)]">{d.totalWishes}</span>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">{d.channels}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHANNELS.map((c) => (
            <ChannelCard key={c.id} c={c} locale={locale} count={counts[c.id] ?? 0} />
          ))}
        </div>
      </section>

      <section className="max-w-2xl">
        <h2 className="text-xl font-semibold mb-4">{d.recentWishes}</h2>
        <WishWall
          initial={recent.items.map((w) => ({ ...w, offeredAt: w.offeredAt?.toISOString() ?? null }))}
          initialCursor={null}
          d={d}
          locale={locale}
          showChannel
        />
      </section>
    </div>
  );
}
