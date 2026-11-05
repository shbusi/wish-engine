import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";

/** Credit packs. ₩1,000 buys 10 wishes (₩100 each, no fee bleed per wish). */
export const CREDIT_PACKS = [{ id: "pack-10", credits: 10, amountKrw: 1000 }] as const;
export type CreditPack = (typeof CREDIT_PACKS)[number];
export const CREDIT_WISH_KRW = 100;

export function getPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

export const WALLET_COOKIE = "we_wallet";
export const WALLET_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365 * 2,
  secure: process.env.NODE_ENV === "production",
};

export function newWalletToken(): string {
  // 20 bytes -> 32 chars base32-ish, grouped for humans: WE-XXXX-XXXX-...
  const raw = randomBytes(20).toString("base64url").replace(/[-_]/g, "x").slice(0, 24).toUpperCase();
  return "WE-" + raw.match(/.{1,6}/g)!.join("-");
}

export function normalizeToken(t: string): string {
  return t.trim().toUpperCase();
}

/** Read the wallet referenced by the cookie, if any. */
export async function currentWallet() {
  const token = (await cookies()).get(WALLET_COOKIE)?.value;
  if (!token) return null;
  return prisma.creditWallet.findUnique({ where: { token } });
}

export async function walletByToken(token: string) {
  return prisma.creditWallet.findUnique({ where: { token: normalizeToken(token) } });
}

export async function createWallet() {
  return prisma.creditWallet.create({ data: { token: newWalletToken() } });
}

/**
 * Wallet for the current visitor, minting one (and its cookie) if absent.
 * Only valid where cookies can be written: route handlers and server actions.
 */
export async function ensureWallet() {
  const store = await cookies();
  const token = store.get(WALLET_COOKIE)?.value;
  const existing = token ? await prisma.creditWallet.findUnique({ where: { token } }) : null;
  if (existing) return existing;
  const w = await createWallet();
  store.set(WALLET_COOKIE, w.token, WALLET_COOKIE_OPTS);
  return w;
}

/**
 * Spend one credit atomically. Returns false when the wallet has none.
 * The caller creates the wish inside the same transaction.
 */
export async function spendOneCredit(
  tx: Pick<typeof prisma, "creditWallet" | "creditTxn">,
  walletId: string,
  refId: string,
): Promise<boolean> {
  const r = await tx.creditWallet.updateMany({
    where: { id: walletId, credits: { gte: 1 } },
    data: { credits: { decrement: 1 } },
  });
  if (r.count === 0) return false;
  await tx.creditTxn.create({ data: { walletId, delta: -1, reason: "spend", refId } });
  return true;
}
