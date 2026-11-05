import { notFound } from "next/navigation";
import { CHANNELS, getChannel } from "@/lib/channels";
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { currentLocale } from "@/lib/locale-server";
import { enabledProviders } from "@/lib/payments";
import { listOfferedWishes } from "@/lib/wishes";
import { currentWallet } from "@/lib/credits";
import { RitualScene } from "@/components/RitualScene";
import { WishForm } from "@/components/WishForm";
import { WishWall } from "@/components/WishWall";

export const dynamic = "force-dynamic";

export default async function ChannelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = getChannel(slug);
  if (!c) notFound();
  const locale = await currentLocale();
  const d = t(locale);

  const dayAgo = new Date(Date.now() - 86_400_000);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [row, today, week, page, wallet] = await Promise.all([
    prisma.channel.findUnique({ where: { id: c.id } }),
    prisma.wish.count({ where: { channelId: c.id, status: "OFFERED", offeredAt: { gte: dayAgo } } }),
    prisma.wish.count({ where: { channelId: c.id, status: "OFFERED", offeredAt: { gte: weekAgo } } }),
    listOfferedWishes({ channelId: c.id, take: 20 }),
    currentWallet(),
  ]);
  const count = row?.wishCount ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <a href="/" className="text-xs text-[var(--muted)]">← {d.allChannels}</a>
          <h1 className="text-3xl font-bold mt-1">
            <span className="mr-2">{c.emoji}</span>
            {c.name[locale]}
          </h1>
          <p className="text-sm text-[var(--muted)]">{d.origin}: {c.origin}</p>
        </div>
        <div className="flex gap-3 text-sm">
          <Stat label={d.stackedSoFar} value={count} unit={c.unit[locale]} hue={c.hue} />
          <Stat label={d.thisWeek} value={week} unit={c.unit[locale]} hue={c.hue} />
          <Stat label={d.todayCount} value={today} unit={c.unit[locale]} hue={c.hue} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <RitualScene visual={c.visual} count={count} hue={c.hue} labels={page.items.map((w) => w.author)} rarities={page.items.map((w) => w.rarity)} />
      </div>

      <p className="max-w-3xl text-[var(--muted)]">{c.description[locale]}</p>

      <div className="grid gap-8 lg:grid-cols-5">
        <section className="lg:col-span-2 card p-5 h-fit">
          <h2 className="text-lg font-semibold mb-3">{d.makeWish}</h2>
          <WishForm channelId={c.id} locale={locale} d={d} providers={enabledProviders()} actionLabel={c.action[locale]} credits={wallet?.credits ?? 0} />
        </section>
        <section className="lg:col-span-3">
          <h2 className="text-lg font-semibold mb-3">{d.recentWishes}</h2>
          <WishWall
            initial={page.items.map((w) => ({ ...w, offeredAt: w.offeredAt?.toISOString() ?? null }))}
            initialCursor={page.nextCursor}
            channelId={c.id}
            d={d}
            locale={locale}
          />
        </section>
      </div>

      <nav className="flex flex-wrap gap-2 pt-4 border-t border-white/10">
        {CHANNELS.filter((x) => x.id !== c.id).map((x) => (
          <a key={x.id} href={`/c/${x.id}`} className="card px-3 py-1.5 text-sm hover:border-white/25">
            {x.emoji} {x.name[locale]}
          </a>
        ))}
      </nav>
    </div>
  );
}

function Stat({ label, value, unit, hue }: { label: string; value: number; unit: string; hue: number }) {
  return (
    <div className="card px-3 py-2 min-w-24">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="font-semibold" style={{ color: `hsl(${hue} 70% 65%)` }}>
        {value.toLocaleString()} <span className="text-xs font-normal text-[var(--muted)]">{unit}</span>
      </div>
    </div>
  );
}
