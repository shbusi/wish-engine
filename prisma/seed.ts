import { PrismaClient } from "@prisma/client";
import { CHANNELS } from "../src/lib/channels";

const prisma = new PrismaClient();

const SAMPLE: Record<string, string[]> = {
  "stone-cairn": ["엄마 수술 잘 되게 해주세요", "올해는 꼭 취업", "Let this be the year I stop being afraid"],
  ema: ["合格しますように", "彼女と来年も一緒にいられますように", "Pass the bar exam"],
  "wishing-fountain": ["Come back to Rome with her", "Un lavoro stabile", "건강하게만 자라다오"],
  "sky-lantern": ["平安", "爸爸早日康复", "To see the northern lights"],
  "ribbon-tree": ["Sağlık ve huzur", "想要一個家", "A quiet year"],
  "prayer-wall": ["Peace.", "Let my brother come home safe", "שלום"],
  "votive-candle": ["Por mi abuela", "For the ones we lost this year", "Grace to forgive"],
  krathong: ["ขอให้มีความสุข", "Let go of what I cannot keep", "Floating last year away"],
  "bonfim-ribbon": ["Saúde, amor, dinheiro", "Que ela diga sim", "Axé"],
  "prayer-flag": ["Safe passage for everyone on the road", "May all beings be free from suffering", "눈 그치기 전에 집에"],
  diya: ["Shanti for my family", "Clear the exam on the first try", "A son who calls home"],
  "shooting-star": ["11:11 — you know what I wished", "Just once, let it work out", "민들레 홀씨처럼 가볍게"],
};

async function main() {
  for (const [i, c] of CHANNELS.entries()) {
    await prisma.channel.upsert({
      where: { id: c.id },
      update: { sortOrder: i },
      create: { id: c.id, sortOrder: i },
    });
  }

  if (process.env.SEED_SAMPLE === "1") {
    for (const [channelId, texts] of Object.entries(SAMPLE)) {
      for (const text of texts) {
        const wish = await prisma.wish.create({
          data: {
            channelId,
            text,
            status: "OFFERED",
            offeredAt: new Date(Date.now() - Math.random() * 6 * 86_400_000),
            amountKrw: [100, 100, 500, 1000][Math.floor(Math.random() * 4)],
            payment: { create: { provider: "mock", providerRef: "seed", currency: "KRW", amount: "100", amountKrw: 100, status: "PAID" } },
          },
        });
        await prisma.channel.update({ where: { id: wish.channelId }, data: { wishCount: { increment: 1 } } });
      }
    }
  }
  console.log("seeded", CHANNELS.length, "channels");
}

main().finally(() => prisma.$disconnect());
