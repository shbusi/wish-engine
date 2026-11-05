"use client";
import { useState } from "react";
import type { Dict } from "@/lib/i18n";

export function BidForm({ auctionId, minimum, balance, d }: { auctionId: string; minimum: number; balance: number; d: Dict }) {
  const [credits, setCredits] = useState(minimum);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function bid(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/auctions/${auctionId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credits }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(d.relic.errors[json.error as keyof typeof d.relic.errors] ?? d.relic.errors.generic);
    window.location.reload();
  }
  return (
    <form onSubmit={bid} className="space-y-2">
      <div className="flex gap-2 items-center">
        <input type="number" min={minimum} className="input !w-32" value={credits} onChange={(e) => setCredits(Number(e.target.value) || minimum)} />
        <span className="text-sm text-[var(--muted)]">🎟️ {d.relic.credits}</span>
        <button className="btn" disabled={busy || credits < minimum || credits > balance}>{d.relic.bid}</button>
      </div>
      <p className="text-xs text-[var(--muted)]">
        {d.relic.minBid}: {minimum} · {d.credits.balance}: {balance}{" "}
        {balance < minimum && <a href="/credits" className="text-[var(--accent)] ml-1">{d.credits.buyLink}</a>}
      </p>
      {err && <p className="text-sm text-red-400">{err}</p>}
    </form>
  );
}

export function CancelAuctionButton({ auctionId, label }: { auctionId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/auctions/${auctionId}/cancel`, { method: "POST" });
        window.location.reload();
      }}
    >
      {label}
    </button>
  );
}
