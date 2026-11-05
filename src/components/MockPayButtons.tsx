"use client";
import { useState } from "react";

export function MockPayButtons({ paymentId, confirmLabel, failLabel }: { paymentId: string; confirmLabel: string; failLabel: string }) {
  const [busy, setBusy] = useState(false);
  async function go(outcome: "PAID" | "FAILED") {
    setBusy(true);
    const res = await fetch("/api/mock/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, outcome }),
    });
    const json = await res.json().catch(() => ({}));
    window.location.href = json.nextUrl ?? "/";
  }
  return (
    <div className="flex gap-3">
      <button className="btn" disabled={busy} onClick={() => go("PAID")}>{confirmLabel}</button>
      <button className="btn btn-ghost" disabled={busy} onClick={() => go("FAILED")}>{failLabel}</button>
    </div>
  );
}
