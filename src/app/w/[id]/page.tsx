import { notFound } from "next/navigation";
import { getChannel } from "@/lib/channels";
import { prisma } from "@/lib/db";
import { t, fmt } from "@/lib/i18n";
import { currentLocale } from "@/lib/locale-server";
import { formatKrw } from "@/lib/money";
import { RitualScene } from "@/components/RitualScene";
import { ShareBar } from "@/components/ShareBar";
import { RelicPanel } from "@/components/RelicPanel";
import { currentWallet } from "@/lib/credits";
import { relicName, RARITY_STYLE, MIN_BID_BY_RARITY, type Rarity } from "@/lib/relics";
import { listOfferedWishes } from "@/lib/wishes";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

function appBase() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const wish = await prisma.wish.findUnique({ where: { id } });
  const c = wish ? getChannel(wish.channelId) : undefined;
  if (!wish || !c || wish.status !== "OFFERED" || !wish.isPublic) return { title: "Wish Engine" };
  const title = `${c.emoji} ${wish.text.slice(0, 60)}${wish.text.length > 60 ? "…" : ""}`;
  const image = `${appBase()}/w/${wish.id}/card?f=og`;
  return {
    title,
    description: `${c.name.en} · Wish Engine`,
    openGraph: { title, description: c.description.en, images: [{ url: image, width: 1200, height: 630 }], type: "article" },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
}

export default async function WishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wish = await prisma.wish.findUnique({
    where: { id },
    include: { payment: true, channel: true, relic: { include: { auctions: { where: { status: "OPEN" }, select: { id: true } } } } },
  });
  if (!wish) notFound();
  const wallet = await currentWallet();
  const c = getChannel(wish.channelId);
  if (!c) notFound();
  const locale = await currentLocale();
  const d = t(locale);
  const status = wish.status as keyof typeof d.status;
  const offered = status === "OFFERED";
  const recent = offered ? await listOfferedWishes({ channelId: c.id, take: 20 }) : { items: [] };
  // Make sure this wish's own name is inscribed even if it isn't in the newest page yet.
  const labels = [wish.author, ...recent.items.filter((w) => w.id !== wish.id).map((w) => w.author)];
  const shareUrl = `${appBase()}/w/${wish.id}?s=1`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div className="card overflow-hidden">
        <RitualScene visual={c.visual} count={wish.channel.wishCount} hue={c.hue} labels={labels} rarities={[wish.rarity, ...recent.items.filter((w) => w.id !== wish.id).map((w) => w.rarity)]} />
      </div>
      <div className="card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--muted)]">{c.emoji} {c.name[locale]}</span>
          <span
            className={`text-xs px-2 py-1 rounded-full ${offered ? "bg-emerald-500/20 text-emerald-300" : status === "PENDING" ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300"}`}
          >
            {d.status[status] ?? status}
          </span>
        </div>
        <h1 className="text-2xl font-bold">{offered ? d.offered : d.status[status]}</h1>
        <p className="text-[var(--muted)]">{offered ? d.offeredBody : status === "PENDING" ? d.pendingBody : ""}</p>
        <blockquote className="border-l-2 border-[var(--accent)] pl-4 text-lg whitespace-pre-wrap">{wish.text}</blockquote>
        <div className="text-sm text-[var(--muted)]">
          — {wish.author || d.anonymous} · {formatKrw(wish.amountKrw, locale)}
          {wish.payment ? ` · ${d.provider[wish.payment.provider as keyof typeof d.provider] ?? wish.payment.provider}` : ""}
        </div>
        {wish.referrals > 0 && (
          <p className="text-sm text-[var(--accent)]">🔗 {fmt(d.shareLoop.joined, { n: wish.referrals })}</p>
        )}
        <div className="flex gap-3 pt-2">
          <a className="btn btn-ghost" href={`/c/${c.id}`}>{d.backToChannel}</a>
        </div>
      </div>
      {wish.relic && (
        <RelicPanel
          relicId={wish.relic.id}
          rarityLabel={RARITY_STYLE[wish.relic.rarity as Rarity].label[locale]}
          rarityColor={RARITY_STYLE[wish.relic.rarity as Rarity].color}
          relicName={relicName(wish.channelId, wish.relic.rarity as Rarity, locale)}
          isOwner={!!wallet && wallet.id === wish.relic.ownerWalletId}
          openAuctionId={wish.relic.auctions[0]?.id ?? null}
          d={d}
          minBid={MIN_BID_BY_RARITY[wish.relic.rarity as Exclude<Rarity, "COMMON">] ?? 1}
          emoji={c.emoji}
        />
      )}
      {offered && wish.isPublic && (
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold">{d.share}</h2>
          <p className="text-sm text-[var(--muted)]">{d.shareLoop.hint}</p>
          <ShareBar
            wishId={wish.id}
            shareUrl={shareUrl}
            text={`${c.emoji} ${wish.text}`}
            labels={{ share: d.shareLoop.native, copy: d.shareLoop.copy, copied: d.shareLoop.copied, download: d.shareLoop.download, x: "X", story: d.shareLoop.story, square: d.shareLoop.square }}
          />
        </div>
      )}
    </div>
  );
}
