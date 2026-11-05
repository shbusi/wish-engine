import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { getChannel } from "@/lib/channels";
import { isLocale } from "@/lib/i18n";
import { loadFont, fontFamilyFor, detectFontLocale } from "@/lib/fonts";
import { WishCard, CARD_SIZES, CARD_COPY, type CardFormat } from "@/lib/card";
import { relicName, RARITY_STYLE, type Rarity } from "@/lib/relics";

export const runtime = "nodejs";

/** GET /w/:id/card?f=story|og|square — PNG share card for an offered wish. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const f = (url.searchParams.get("f") ?? "og") as CardFormat;
  const format: CardFormat = f in CARD_SIZES ? f : "og";

  const wish = await prisma.wish.findUnique({ where: { id }, include: { channel: true } });
  if (!wish || wish.status !== "OFFERED" || !wish.isPublic) return new Response("Not found", { status: 404 });
  const channel = getChannel(wish.channelId);
  if (!channel) return new Response("Not found", { status: 404 });

  const locale = isLocale(wish.locale) ? wish.locale : "en";
  const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  const copy = CARD_COPY[locale];
  const rarity = wish.rarity as Rarity;
  const rName = relicName(wish.channelId, rarity, locale);
  const allText = [wish.text, wish.author ?? "", channel.name[locale], channel.unit[locale], base, copy.cta, copy.by, copy.joined(wish.referrals), RARITY_STYLE[rarity].label[locale], rName, " - "].join("");
  const fontLocale = detectFontLocale(allText, locale);
  const fontFamily = fontFamilyFor(fontLocale);
  const [regular, bold] = await Promise.all([loadFont(fontLocale, 400, allText), loadFont(fontLocale, 700, allText)]);
  const fonts = [
    regular && { name: fontFamily, data: regular, weight: 400 as const, style: "normal" as const },
    bold && { name: fontFamily, data: bold, weight: 700 as const, style: "normal" as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[];

  return new ImageResponse(
    (
      <WishCard
        channel={channel}
        locale={locale}
        text={wish.text}
        author={wish.author}
        referrals={wish.referrals}
        count={wish.channel.wishCount}
        url={`${base}/w/${wish.id}`}
        format={format}
        fontFamily={fontFamily}
        rarity={rarity}
        relicName={rName}
      />
    ),
    {
      ...CARD_SIZES[format],
      fonts,
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
    },
  );
}
