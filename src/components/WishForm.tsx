"use client";
import { useState } from "react";
import type { Locale } from "@/lib/channels";
import type { Dict } from "@/lib/i18n";
import { OFFERING_PRESETS_KRW, formatKrw, formatApprox } from "@/lib/money";
import type { ProviderId } from "@/lib/payments/types";

export function WishForm({
  channelId,
  locale,
  d,
  providers,
  actionLabel,
  credits = 0,
}: {
  channelId: string;
  locale: Locale;
  d: Dict;
  providers: ProviderId[];
  actionLabel: string;
  /** Credits in the visitor's wallet; when > 0 a "use 1 credit" option appears first. */
  credits?: number;
}) {
  type PayChoice = ProviderId | "credits";
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [amount, setAmount] = useState<number>(OFFERING_PRESETS_KRW[0]);
  const [provider, setProvider] = useState<PayChoice>(credits > 0 ? "credits" : providers[0]);
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (text.trim().length < 2) return setError(d.errors.tooShort);
    if (text.length > 280) return setError(d.errors.tooLong);
    setBusy(true);
    try {
      const res = await fetch("/api/wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, text, author: author || null, locale, isPublic, amountKrw: amount, provider }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(
          json.error === "rate_limited" ? d.errors.rate : json.error === "too_long" ? d.errors.tooLong : json.error === "too_short" ? d.errors.tooShort : json.error === "insufficient_credits" || json.error === "no_wallet" ? d.credits.insufficient : d.errors.generic,
        );
        return;
      }
      window.location.href = json.redirectUrl;
    } catch {
      setError(d.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const usingCredit = provider === "credits";

  if (providers.length === 0 && credits === 0) {
    return <p className="text-sm text-[var(--muted)]">No payment provider is configured.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="text-sm text-[var(--muted)]">{d.yourWish}</span>
        <textarea
          className="input mt-1 min-h-28"
          maxLength={280}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={d.wishPlaceholder}
          required
        />
        <span className="block text-right text-xs text-[var(--muted)]">{text.length}/280</span>
      </label>

      <label className="block">
        <span className="text-sm text-[var(--muted)]">{d.yourName}</span>
        <input className="input mt-1" maxLength={40} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder={d.namePlaceholder} />
      </label>

      <div className={usingCredit ? "hidden" : ""}>
        <span className="text-sm text-[var(--muted)]">{d.offering}</span>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {OFFERING_PRESETS_KRW.map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setAmount(k)}
              className={`card px-2 py-2 text-center text-sm ${amount === k ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`}
            >
              <div className="font-semibold">{formatKrw(k, locale)}</div>
              <div className="text-[10px] text-[var(--muted)]">{formatApprox(k)}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--muted)] mt-1">{d.offeringHint}</p>
      </div>

      <div>
        <span className="text-sm text-[var(--muted)]">{d.payWith}</span>
        <div className="mt-1 flex gap-2 flex-wrap">
          {credits > 0 && (
            <button
              type="button"
              onClick={() => setProvider("credits")}
              className={`card px-3 py-2 text-sm ${usingCredit ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`}
            >
              🎟️ {d.credits.useCredit} ({credits})
            </button>
          )}
          {providers.map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => setProvider(p)}
              className={`card px-3 py-2 text-sm ${provider === p ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`}
            >
              {p === "paypal" ? "💳 " : p === "crypto" ? "₿ " : "🧪 "}
              {d.provider[p]}
            </button>
          ))}
        </div>
      </div>

      {!usingCredit && (
        <a href="/credits" className="block text-xs text-[var(--accent)]">{d.credits.buyLink}</a>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        {d.makePublic}
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button className="btn w-full" disabled={busy}>
        {busy ? d.submitting : usingCredit ? `${actionLabel} · 🎟️ 1` : `${actionLabel} · ${formatKrw(amount, locale)}`}
      </button>
    </form>
  );
}
