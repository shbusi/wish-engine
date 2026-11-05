import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isLocale } from "@/lib/i18n";
import { enabledProviders, getProvider } from "@/lib/payments";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { createWallet, getPack, WALLET_COOKIE, WALLET_COOKIE_OPTS } from "@/lib/credits";
import { settlePayment } from "@/lib/wishes";

export const runtime = "nodejs";

const Body = z.object({
  packId: z.string(),
  provider: z.string().optional(),
  locale: z.string().optional(),
});

/** POST /api/credits/checkout — buy a credit pack. Creates the wallet cookie if needed. */
export async function POST(req: Request) {
  if (!rateLimit(`credits:${clientKey(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const pack = getPack(parsed.data.packId);
  if (!pack) return NextResponse.json({ error: "unknown_pack" }, { status: 404 });

  const providerId = parsed.data.provider ?? enabledProviders()[0];
  const provider = providerId ? getProvider(providerId) : null;
  if (!provider) return NextResponse.json({ error: "no_provider" }, { status: 400 });
  const locale = isLocale(parsed.data.locale) ? parsed.data.locale : "en";

  // Wallet: reuse the cookie's wallet or mint a new one.
  const cookieHeader = req.headers.get("cookie") ?? "";
  const token = cookieHeader.match(new RegExp(`(?:^|;\\s*)${WALLET_COOKIE}=([^;]+)`))?.[1];
  let wallet = token ? await prisma.creditWallet.findUnique({ where: { token: decodeURIComponent(token) } }) : null;
  const minted = !wallet;
  if (!wallet) wallet = await createWallet();

  const purchase = await prisma.creditPurchase.create({
    data: {
      walletId: wallet.id,
      packId: pack.id,
      credits: pack.credits,
      amountKrw: pack.amountKrw,
      payment: { create: { provider: provider.id, currency: "KRW", amount: String(pack.amountKrw), amountKrw: pack.amountKrw } },
    },
    include: { payment: true },
  });
  const payment = purchase.payment!;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  try {
    const checkout = await provider.createCheckout({
      paymentId: payment.id,
      wishId: purchase.id,
      amountKrw: pack.amountKrw,
      locale,
      returnUrl: provider.id === "paypal" ? `${base}/api/paypal/return?p=${payment.id}` : `${base}/credits?purchase=${purchase.id}`,
      cancelUrl: provider.id === "paypal" ? `${base}/api/paypal/cancel?p=${payment.id}` : `${base}/credits`,
      description: `Wish Engine credit pack: ${pack.credits} wishes`,
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { providerRef: checkout.providerRef, currency: checkout.currency, amount: checkout.amount },
    });
    const res = NextResponse.json({ purchaseId: purchase.id, paymentId: payment.id, redirectUrl: checkout.redirectUrl });
    if (minted) res.cookies.set(WALLET_COOKIE, wallet.token, WALLET_COOKIE_OPTS);
    return res;
  } catch (err) {
    console.error("credit checkout failed", err);
    await settlePayment({ provider: provider.id, paymentId: payment.id, outcome: "FAILED" });
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
