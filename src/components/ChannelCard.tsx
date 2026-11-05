import type { ChannelDef, Locale } from "@/lib/channels";
import { RitualScene } from "./RitualScene";

export function ChannelCard({ c, locale, count }: { c: ChannelDef; locale: Locale; count: number }) {
  return (
    <a href={`/c/${c.id}`} className="card overflow-hidden hover:border-white/25 transition group block">
      <div className="aspect-[2/1] overflow-hidden bg-black/30">
        <RitualScene visual={c.visual} count={count} hue={c.hue} />
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-lg">
            <span className="mr-2">{c.emoji}</span>
            {c.name[locale]}
          </h3>
          <span className="text-xs text-[var(--muted)]">{c.origin}</span>
        </div>
        <p className="text-sm text-[var(--muted)] mt-1 line-clamp-2">{c.description[locale]}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: `hsl(${c.hue} 70% 65%)` }}>
            {c.action[locale]} →
          </span>
          <span className="text-xs text-[var(--muted)]">
            {count.toLocaleString()} {c.unit[locale]}
          </span>
        </div>
      </div>
    </a>
  );
}
