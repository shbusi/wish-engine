"use client";
import { useState } from "react";

export function MockPayButtons({ paymentId, wishId, confirmLabel, failLabel }: { paymentId: string; wishId: string; confirmLabel: string; failLabel: string }) {
  const [busy, setBusy] = useState(false);
  async function go(outcome: "PAID" | "FAILED") {
    setBusy(true);
    await fetch("/api/mock/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, outcome }),
    });
    window.location.href = `/w/${wishId}`;
  }
  return (
    <div className="flex gap-3">
      <button className="btn" disabled={busy} onClick={() => go("PAID")}>{confirmLabel}</button>
      <button className="btn btn-ghost" disabled={busy} onClick={() => go("FAILED")}>{failLabel}</button>
    </div>
  );
}
