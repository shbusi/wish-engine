import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { currentLocale } from "@/lib/locale-server";
import { enabledProviders } from "@/lib/payments";
import { CREDIT_PACKS, currentWallet } from "@/lib/credits";
import { formatKrw } from "@/lib/money";
import { BuyPack, ClaimWallet, RecoveryCode } from "@/components/CreditsPanel";
import { getChannel } from "@/lib/channels";
import { relicName, RARITY_STYLE, type Rarity } from "@/lib/relics";

export const dynamic = "force-dynamic";

export default async function CreditsPage({ searchParams }: { searchParams: Promise<{ purchase?: string }> }) {
  const { purchase: purchaseId } = await searchParams;
  const locale = await currentLocale();
  const d = t(locale);
  const wallet = await currentWallet();
  const [txns, purchase, relics] = await Promise.all([
    wallet ? prisma.creditTxn.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: "desc" }, take: 20 }) : [],
    purchaseId ? prisma.creditPurchase.findUnique({ where: { id: purchaseId } }) : null,
    wallet
      ? prisma.relic.findMany({ where: { ownerWalletId: wallet.id }, orderBy: { createdAt: "desc" }, include: { auctions: { where: { status: "OPEN" }, select: { id: true } } } })
      : [],
  ]);
  const pack = CREDIT_PACKS[0];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-8">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-bold">🎟️ {d.credits.title}</h1>
        <div className="card px-4 py-2 text-right">
          <div className="text-3xl font-bold text-[var(--accent)]">{wallet?.credits ?? 0}</div>
          <div className="text-xs text-[var(--muted)]">{d.credits.balance}</div>
        </div>
      </div>

      {purchase && purchase.walletId === wallet?.id && (
        <div className={`card p-4 text-sm ${purchase.status === "PAID" ? "border-emerald-500/40" : "border-amber-500/40"}`}>
          {purchase.status === "PAID" ? `✅ ${d.credits.purchaseDone}` : purchase.status === "CREATED" ? `⏳ ${d.credits.purchasePending}` : `❌ ${d.status.FAILED}`}
        </div>
      )}

      <section className="card p-6 space-y-3">
        <h2 className="text-xl font-semibold">{d.credits.packTitle}</h2>
        <p className="text-[var(--muted)]">{d.credits.packBody}</p>
        <div className="text-sm text-[var(--muted)]">
          {pack.credits} × {formatKrw(100, locale)} = <strong className="text-[var(--fg)]">{formatKrw(pack.amountKrw, locale)}</strong>
        </div>
        <BuyPack pack={pack} providers={enabledProviders()} locale={locale} d={d} />
      </section>

      {wallet ? (
        <section className="space-y-2">
          <h2 className="font-semibold">{d.credits.recovery}</h2>
          <p className="text-sm text-[var(--muted)]">{d.credits.recoveryBody}</p>
          <RecoveryCode token={wallet.token} label={d.credits.recovery} />
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-semibold">{d.credits.claim}</h2>
        <ClaimWallet d={d} />
      </section>

      {relics.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">🏺 {d.relic.myRelics}</h2>
          <ul className="card divide-y divide-white/10">
            {relics.map((r) => {
              const c = getChannel(r.channelId)!;
              const rs = RARITY_STYLE[r.rarity as Rarity];
              return (
                <li key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <a href={`/w/${r.wishId}`}>
                    {c.emoji} <span style={{ color: rs.color }}>✦ {rs.label[locale]}</span> · {relicName(r.channelId, r.rarity as Rarity, locale)}
                  </a>
                  {r.auctions[0] ? <a className="text-[var(--accent)]" href={`/auctions/${r.auctions[0].id}`}>{d.relic.live} →</a> : <a className="text-[var(--muted)]" href={`/w/${r.wishId}`}>{d.relic.listAuction} →</a>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {txns.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">{d.credits.history}</h2>
          <ul className="card divide-y divide-white/10">
            {txns.map((x) => (
              <li key={x.id} className="flex justify-between px-4 py-2 text-sm">
                <span>{d.credits.reason[x.reason as keyof typeof d.credits.reason] ?? x.reason}</span>
                <span className={x.delta > 0 ? "text-emerald-300" : "text-[var(--muted)]"}>
                  {x.delta > 0 ? "+" : ""}{x.delta} · {new Date(x.createdAt).toLocaleDateString(locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
