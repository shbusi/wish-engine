"use client";
import { useEffect, useState } from "react";
import type { Dict } from "@/lib/i18n";

/** Reveal animation + (for the owner) a "list for auction" form. */
export function RelicPanel({
  relicId,
  rarityLabel,
  rarityColor,
  relicName,
  isOwner,
  openAuctionId,
  d,
  minBid,
  emoji,
}: {
  relicId: string;
  rarityLabel: string;
  rarityColor: string;
  relicName: string;
  isOwner: boolean;
  openAuctionId: string | null;
  d: Dict;
  minBid: number;
  emoji: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [hours, setHours] = useState<24 | 72>(24);
  const [bid, setBid] = useState(minBid);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 300);
    return () => clearTimeout(t);
  }, []);

  async function list() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/auctions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relicId, hours, minBidCredits: bid }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(d.relic.errors[json.error as keyof typeof d.relic.errors] ?? d.relic.errors.generic);
    window.location.href = `/auctions/${json.auctionId}`;
  }

  return (
    <div
      className="card p-6 space-y-4 transition-all duration-700"
      style={{
        borderColor: rarityColor,
        boxShadow: revealed ? `0 0 60px ${rarityColor}55` : "none",
        transform: revealed ? "scale(1)" : "scale(.96)",
        opacity: revealed ? 1 : 0,
      }}
    >
      <div className="text-xs uppercase tracking-widest" style={{ color: rarityColor }}>
        ✦ {d.relic.dropped}
      </div>
      <div className="flex items-center gap-4">
        <div
          className="text-5xl w-20 h-20 flex items-center justify-center rounded-2xl anim-flicker"
          style={{ background: `${rarityColor}22`, boxShadow: `inset 0 0 30px ${rarityColor}66` }}
        >
          {emoji}
        </div>
        <div>
          <div className="text-2xl font-bold">{relicName}</div>
          <div className="text-sm" style={{ color: rarityColor }}>
            {d.relic.rarity}: {rarityLabel}
          </div>
        </div>
      </div>

      {openAuctionId ? (
        <a className="btn" href={`/auctions/${openAuctionId}`}>🏺 {d.relic.auctions} →</a>
      ) : isOwner ? (
        <div className="space-y-3 pt-2 border-t border-white/10">
          <p className="text-sm text-[var(--muted)]">{d.relic.youFound}. {d.relic.fee}</p>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-[var(--muted)]">{d.relic.duration}</span>
            {[24, 72].map((h) => (
              <button key={h} type="button" onClick={() => setHours(h as 24 | 72)} className={`card px-3 py-1.5 text-sm ${hours === h ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`}>
                {h} {d.relic.hours}
              </button>
            ))}
            <span className="text-sm text-[var(--muted)] ml-2">{d.relic.minBid}</span>
            <input type="number" min={minBid} className="input !w-28" value={bid} onChange={(e) => setBid(Math.max(minBid, Number(e.target.value) || minBid))} />
            <span className="text-sm text-[var(--muted)]">🎟️</span>
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <div className="flex gap-2">
            <button className="btn" disabled={busy} onClick={list}>🏺 {d.relic.listAuction}</button>
            <a className="btn btn-ghost" href="/credits">{d.relic.keep}</a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
