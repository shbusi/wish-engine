import { cookies, headers } from "next/headers";
import { isLocale, negotiateLocale } from "./i18n";
import type { Locale } from "./channels";

export const LOCALE_COOKIE = "we_locale";

export async function currentLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  return negotiateLocale((await headers()).get("accept-language"));
}
