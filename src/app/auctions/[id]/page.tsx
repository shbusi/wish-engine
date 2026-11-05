import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { currentLocale } from "@/lib/locale-server";
import { getChannel } from "@/lib/channels";
import { relicName, RARITY_STYLE, type Rarity } from "@/lib/relics";
import { settleAuction } from "@/lib/auctions";
import { currentWallet } from "@/lib/credits";
import { BidForm, CancelAuctionButton } from "@/components/BidForm";
import { timeLeft } from "../page";

export const dynamic = "force-dynamic";

export default async function AuctionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await settleAuction(id);
  const [a, wallet, locale] = await Promise.all([
    prisma.auction.findUnique({
      where: { id },
      include: {
        relic: { include: { wish: { select: { id: true, text: true, author: true, channelId: true } } } },
        bids: { orderBy: [{ credits: "desc" }, { createdAt: "asc" }], take: 20 },
      },
    }),
    currentWallet(),
    currentLocale(),
  ]);
  if (!a) notFound();
  const d = t(locale);
  const c = getChannel(a.relic.channelId)!;
  const rs = RARITY_STYLE[a.relic.rarity as Rarity];
  const top = a.bids.find((b) => b.status === "ACTIVE" || b.status === "WON");
  const minimum = top ? top.credits + 1 : a.minBidCredits;
  const isSeller = wallet?.id === a.sellerWalletId;
  const myTop = top && wallet && top.walletId === wallet.id;
  const myOutbid = !myTop && wallet && a.bids.some((b) => b.walletId === wallet.id && b.status === "OUTBID");
  const open = a.status === "OPEN";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <a href="/auctions" className="text-xs text-[var(--muted)]">← {d.relic.auctions}</a>
      <div className="card p-6 space-y-4" style={{ borderColor: rs.color, boxShadow: `0 0 50px ${rs.glow}` }}>
        <div className="flex items-center gap-4">
          <div className="text-5xl w-20 h-20 flex items-center justify-center rounded-2xl" style={{ background: `${rs.color}22` }}>{c.emoji}</div>
          <div>
            <div className="text-xs" style={{ color: rs.color }}>✦ {rs.label[locale]} · {c.name[locale]}</div>
            <h1 className="text-2xl font-bold">{relicName(a.relic.channelId, a.relic.rarity as Rarity, locale)}</h1>
            <a href={`/w/${a.relic.wish.id}`} className="text-sm text-[var(--muted)]">“{a.relic.wish.text.slice(0, 80)}” — {a.relic.wish.author || d.anonymous}</a>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label={top ? d.relic.currentBid : d.relic.minBid} value={`🎟️ ${top ? top.credits : a.minBidCredits}`} />
          <Stat label={open ? d.relic.endsIn : a.status === "SETTLED" ? d.relic.settled : d.relic.ended} value={open ? timeLeft(a.endsAt) : a.status === "SETTLED" ? `🎟️ ${a.winningBidCredits}` : d.relic.noBids} />
          <Stat label={d.relic.owner} value={wallet?.id === a.relic.ownerWalletId ? d.relic.you : a.relic.ownerWalletId.slice(-6)} />
        </div>

        {open && (
          <div className="pt-3 border-t border-white/10 space-y-2">
            {isSeller ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--muted)]">{d.relic.sellerIsYou}</span>
                {!top && <CancelAuctionButton auctionId={a.id} label={d.relic.cancel} />}
              </div>
            ) : (
              <>
                {myTop && <p className="text-sm text-emerald-300">✓ {d.relic.yourBidTop}</p>}
                {myOutbid && <p className="text-sm text-amber-300">{d.relic.outbid}</p>}
                <BidForm auctionId={a.id} minimum={minimum} balance={wallet?.credits ?? 0} d={d} />
              </>
            )}
            <p className="text-xs text-[var(--muted)]">{d.relic.fee}</p>
          </div>
        )}
        {a.status === "SETTLED" && (
          <p className="text-sm pt-3 border-t border-white/10">
            {d.relic.winner}: {wallet?.id === a.winnerWalletId ? d.relic.you : a.winnerWalletId?.slice(-6)} · 🎟️ {a.winningBidCredits}
          </p>
        )}
      </div>

      {a.bids.length > 0 && (
        <ul className="card divide-y divide-white/10 text-sm">
          {a.bids.map((b) => (
            <li key={b.id} className="flex justify-between px-4 py-2">
              <span>{wallet?.id === b.walletId ? d.relic.you : b.walletId.slice(-6)}</span>
              <span className={b.status === "OUTBID" ? "text-[var(--muted)] line-through" : ""}>🎟️ {b.credits}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
