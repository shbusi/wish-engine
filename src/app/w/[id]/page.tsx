import { notFound } from "next/navigation";
import { getChannel } from "@/lib/channels";
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { currentLocale } from "@/lib/locale-server";
import { formatKrw } from "@/lib/money";
import { RitualScene } from "@/components/RitualScene";

export const dynamic = "force-dynamic";

export default async function WishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wish = await prisma.wish.findUnique({ where: { id }, include: { payment: true, channel: true } });
  if (!wish) notFound();
  const c = getChannel(wish.channelId);
  if (!c) notFound();
  const locale = await currentLocale();
  const d = t(locale);
  const status = wish.status as keyof typeof d.status;
  const offered = status === "OFFERED";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div className="card overflow-hidden">
        <RitualScene visual={c.visual} count={wish.channel.wishCount} hue={c.hue} />
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
        <div className="flex gap-3 pt-2">
          <a className="btn btn-ghost" href={`/c/${c.id}`}>{d.backToChannel}</a>
          {offered && wish.isPublic && (
            <a
              className="btn"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${c.emoji} ${wish.text}`)}&url=${encodeURIComponent((process.env.NEXT_PUBLIC_APP_URL ?? "") + `/w/${wish.id}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              {d.share}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
