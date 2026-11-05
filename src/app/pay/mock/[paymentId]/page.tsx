import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { currentLocale } from "@/lib/locale-server";
import { formatKrw } from "@/lib/money";
import { getProvider } from "@/lib/payments";
import { MockPayButtons } from "@/components/MockPayButtons";
import { afterPaymentUrl } from "@/lib/wishes";

export const dynamic = "force-dynamic";

export default async function MockPay({ params }: { params: Promise<{ paymentId: string }> }) {
  if (!getProvider("mock")) notFound();
  const { paymentId } = await params;
  const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { wish: true, purchase: true } });
  if (!p) notFound();
  const locale = await currentLocale();
  const d = t(locale);
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-6 space-y-4">
        <h1 className="text-xl font-bold">🧪 {d.mockPayTitle}</h1>
        <p className="text-sm text-[var(--muted)]">{d.mockPayBody}</p>
        <div className="text-3xl font-bold">{formatKrw(p.amountKrw, locale)}</div>
        <blockquote className="text-sm border-l-2 border-white/20 pl-3 text-[var(--muted)]">
          {p.wish ? p.wish.text : p.purchase ? `🎟️ ${d.credits.packTitle} (${p.purchase.credits})` : ""}
        </blockquote>
        {p.status === "CREATED" ? (
          <MockPayButtons paymentId={p.id} confirmLabel={d.mockPayConfirm} failLabel={d.mockPayFail} />
        ) : (
          <a className="btn" href={afterPaymentUrl("", p)}>{d.status[(p.wish?.status ?? (p.status === "PAID" ? "OFFERED" : "FAILED")) as keyof typeof d.status]}</a>
        )}
      </div>
    </div>
  );
}
