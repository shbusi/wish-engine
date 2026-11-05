"use client";
import { usePathname } from "next/navigation";
import { LOCALES, LOCALE_LABEL } from "@/lib/i18n";
import type { Locale } from "@/lib/channels";

export function LocaleSwitcher({ current }: { current: Locale }) {
  const path = usePathname() || "/";
  return (
    <select
      aria-label="Language"
      className="input !w-auto !py-1 !px-2 text-sm"
      value={current}
      onChange={(e) => {
        window.location.href = `/api/locale?set=${e.target.value}&back=${encodeURIComponent(path)}`;
      }}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABEL[l]}
        </option>
      ))}
    </select>
  );
}
