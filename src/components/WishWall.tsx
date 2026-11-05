"use client";
import { useState } from "react";
import type { Dict } from "@/lib/i18n";
import { formatKrw } from "@/lib/money";
import { CHANNEL_MAP, type Locale } from "@/lib/channels";

export interface PublicWish {
  id: string;
  channelId: string;
  text: string;
  author: string | null;
  locale: string;
  amountKrw: number;
  offeredAt: string | Date | null;
}

export function WishWall({
  initial,
  initialCursor,
  channelId,
  d,
  locale,
  showChannel = false,
}: {
  initial: PublicWish[];
  initialCursor: string | null;
  channelId?: string;
  d: Dict;
  locale: Locale;
  showChannel?: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [busy, setBusy] = useState(false);

  async function more() {
    if (!cursor) return;
    setBusy(true);
    const q = new URLSearchParams({ cursor });
    if (channelId) q.set("channel", channelId);
    const res = await fetch(`/api/wishes?${q}`);
    const json = (await res.json()) as { items: PublicWish[]; nextCursor: string | null };
    setItems((prev) => [...prev, ...json.items]);
    setCursor(json.nextCursor);
    setBusy(false);
  }

  if (items.length === 0) return <p className="text-sm text-[var(--muted)]">{d.noWishes}</p>;

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {items.map((w) => {
          const c = CHANNEL_MAP[w.channelId];
          return (
            <li key={w.id} className="card p-3">
              <p className="whitespace-pre-wrap break-words">{w.text}</p>
              <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted)]">
                <span>
                  {showChannel && c ? <a href={`/c/${c.id}`} className="mr-2">{c.emoji} {c.name[locale]}</a> : null}
                  — {w.author || d.anonymous}
                </span>
                <span>
                  {formatKrw(w.amountKrw, locale)}
                  {w.offeredAt ? ` · ${new Date(w.offeredAt).toLocaleDateString(locale)}` : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {cursor && (
        <button onClick={more} disabled={busy} className="btn btn-ghost w-full">
          {d.moreWishes}
        </button>
      )}
    </div>
  );
}
