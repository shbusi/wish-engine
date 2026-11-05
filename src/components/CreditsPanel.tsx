"use client";
import { useState } from "react";
import type { Locale } from "@/lib/channels";
import type { Dict } from "@/lib/i18n";
import { formatKrw, formatApprox } from "@/lib/money";
import type { ProviderId } from "@/lib/payments/types";

export function BuyPack({
  pack,
  providers,
  locale,
  d,
}: {
  pack: { id: string; credits: number; amountKrw: number };
  providers: ProviderId[];
  locale: Locale;
  d: Dict;
}) {
  const [provider, setProvider] = useState<ProviderId>(providers[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id, provider, locale }),
      });
      const json = await res.json();
      if (!res.ok) return setError(json.error === "rate_limited" ? d.errors.rate : d.errors.generic);
      window.location.href = json.redirectUrl;
    } catch {
      setError(d.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  if (providers.length === 0) return <p className="text-sm text-[var(--muted)]">No payment provider is configured.</p>;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
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
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className="btn w-full" disabled={busy} onClick={buy}>
        {busy ? d.submitting : `${d.credits.buy} · ${formatKrw(pack.amountKrw, locale)} ${formatApprox(pack.amountKrw)}`}
      </button>
    </div>
  );
}

export function ClaimWallet({ d }: { d: Dict }) {
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function claim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/credits/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg(d.credits.claimed);
      window.location.reload();
    } else {
      setMsg(res.status === 404 ? d.credits.notFound : d.errors.generic);
    }
  }
  return (
    <form onSubmit={claim} className="flex gap-2">
      <input className="input font-mono text-sm" value={token} onChange={(e) => setToken(e.target.value)} placeholder={d.credits.claimPlaceholder} />
      <button className="btn btn-ghost whitespace-nowrap" disabled={busy || token.length < 8}>{d.credits.claimButton}</button>
      {msg && <span className="text-sm self-center text-[var(--muted)]">{msg}</span>}
    </form>
  );
}

export function RecoveryCode({ token, label }: { token: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="card px-3 py-2 font-mono text-sm tracking-wide hover:border-white/25 text-left w-full"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(token);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      title={label}
    >
      {token} {copied ? "✓" : "⧉"}
    </button>
  );
}
