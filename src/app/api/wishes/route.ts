import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getChannel } from "@/lib/channels";
import { isLocale } from "@/lib/i18n";
import { isValidOffering, BASE_KRW } from "@/lib/money";
import { sanitizeWish, violates, WISH_MAX, WISH_MIN, NAME_MAX } from "@/lib/moderation";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { enabledProviders, getProvider } from "@/lib/payments";
import { listOfferedWishes, settlePayment } from "@/lib/wishes";
import { currentWallet, spendOneCredit, CREDIT_WISH_KRW } from "@/lib/credits";

export const runtime = "nodejs";

const Body = z.object({
  channelId: z.string().min(1),
  text: z.string().min(1).max(WISH_MAX * 2),
  author: z.string().max(NAME_MAX).optional().nullable(),
  locale: z.string().optional(),
  isPublic: z.boolean().optional().default(true),
  amountKrw: z.number().int().optional().default(BASE_KRW),
  provider: z.string().optional(),
});

/** GET /api/wishes?channel=&cursor=&take= — public wall */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const channelId = url.searchParams.get("channel") ?? undefined;
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const take = Number(url.searchParams.get("take") ?? 20);
  if (channelId && !getChannel(channelId)) {
    return NextResponse.json({ error: "unknown_channel" }, { status: 404 });
  }
  const page = await listOfferedWishes({ channelId, cursor, take });
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}

/** POST /api/wishes — create a pending wish + hosted checkout */
export async function POST(req: Request) {
  if (!rateLimit(`wish:${clientKey(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const b = parsed.data;

  const channel = getChannel(b.channelId);
  if (!channel) return NextResponse.json({ error: "unknown_channel" }, { status: 404 });

  const text = sanitizeWish(b.text);
  if (text.length < WISH_MIN) return NextResponse.json({ error: "too_short" }, { status: 400 });
  if (text.length > WISH_MAX) return NextResponse.json({ error: "too_long" }, { status: 400 });
  if (violates(text)) return NextResponse.json({ error: "rejected" }, { status: 400 });

  const locale = isLocale(b.locale) ? b.locale : "en";
  const author = b.author?.trim() ? b.author.trim().slice(0, NAME_MAX) : null;

  // Ensure channel row exists (seed normally does this; be forgiving).
  await prisma.channel.upsert({ where: { id: channel.id }, update: {}, create: { id: channel.id } });

  // --- Pay with a pre-purchased credit: no checkout, the wish is offered immediately.
  if (b.provider === "credits") {
    const wallet = await currentWallet();
    if (!wallet) return NextResponse.json({ error: "no_wallet" }, { status: 402 });
    const result = await prisma.$transaction(async (tx) => {
      const wish = await tx.wish.create({
        data: {
          channelId: channel.id,
          text,
          author,
          locale,
          isPublic: b.isPublic,
          amountKrw: CREDIT_WISH_KRW,
          status: "PENDING",
          walletId: wallet.id,
        },
      });
      const ok = await spendOneCredit(tx, wallet.id, wish.id);
      if (!ok) throw new Error("insufficient_credits");
      await tx.wish.update({ where: { id: wish.id }, data: { status: "OFFERED", offeredAt: new Date() } });
      await tx.payment.create({
        data: { wishId: wish.id, provider: "credits", providerRef: wallet.id, currency: "CREDIT", amount: "1", amountKrw: CREDIT_WISH_KRW, status: "PAID" },
      });
      await tx.channel.update({ where: { id: channel.id }, data: { wishCount: { increment: 1 } } });
      return wish;
    }).catch((e: Error) => (e.message === "insufficient_credits" ? null : Promise.reject(e)));
    if (!result) return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });
    const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    return NextResponse.json({ wishId: result.id, redirectUrl: `${base}/w/${result.id}` });
  }

  if (!isValidOffering(b.amountKrw)) return NextResponse.json({ error: "bad_amount" }, { status: 400 });

  const providerId = b.provider ?? enabledProviders()[0];
  const provider = providerId ? getProvider(providerId) : null;
  if (!provider) return NextResponse.json({ error: "no_provider" }, { status: 400 });

  const wish = await prisma.wish.create({
    data: {
      channelId: channel.id,
      text,
      author,
      locale,
      isPublic: b.isPublic,
      amountKrw: b.amountKrw,
      status: "PENDING",
      payment: {
        create: { provider: provider.id, currency: "KRW", amount: String(b.amountKrw), amountKrw: b.amountKrw },
      },
    },
    include: { payment: true },
  });
  const payment = wish.payment!;

  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const checkout = await provider.createCheckout({
      paymentId: payment.id,
      wishId: wish.id,
      amountKrw: b.amountKrw,
      locale,
      returnUrl:
        provider.id === "paypal" ? `${base}/api/paypal/return?p=${payment.id}` : `${base}/w/${wish.id}`,
      cancelUrl: provider.id === "paypal" ? `${base}/api/paypal/cancel?p=${payment.id}` : `${base}/w/${wish.id}`,
      description: `${channel.name.en}: ${channel.action.en}`,
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { providerRef: checkout.providerRef, currency: checkout.currency, amount: checkout.amount },
    });
    return NextResponse.json({ wishId: wish.id, paymentId: payment.id, redirectUrl: checkout.redirectUrl });
  } catch (err) {
    console.error("checkout failed", err);
    await settlePayment({ provider: provider.id, paymentId: payment.id, outcome: "FAILED" });
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
