import type { Metadata } from "next";
import "./globals.css";
import { currentLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

export const metadata: Metadata = {
  title: "Wish Engine",
  description:
    "Every culture's way of asking for a blessing — stone cairns, ema, fountains, lanterns — in one place. Offer ₩100 and make a wish.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await currentLocale();
  const d = t(locale);
  return (
    <html lang={locale}>
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-white/10">
          <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-4">
            <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="text-xl">🪨</span>
              <span>Wish Engine</span>
              <span className="hidden sm:inline text-xs text-[var(--muted)] font-normal ml-2">{d.tagline}</span>
            </a>
            <nav className="flex items-center gap-4 text-sm">
              <a href="/credits" className="text-[var(--muted)] hover:text-[var(--fg)]">🎟️ {d.credits.title}</a>
              <a href="/about" className="text-[var(--muted)] hover:text-[var(--fg)]">{d.about}</a>
              <LocaleSwitcher current={locale} />
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-white/10 py-8 text-center text-xs text-[var(--muted)]">
          Wish Engine · 12 rituals · one small offering per wish
        </footer>
      </body>
    </html>
  );
}
