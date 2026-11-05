import { NextResponse } from "next/server";
import { isLocale } from "@/lib/i18n";
import { LOCALE_COOKIE } from "@/lib/locale-server";

/** GET /api/locale?set=ko&back=/c/stone-cairn */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const set = url.searchParams.get("set");
  const back = url.searchParams.get("back") ?? "/";
  const safeBack = back.startsWith("/") && !back.startsWith("//") ? back : "/";
  const res = NextResponse.redirect(new URL(safeBack, url.origin));
  if (isLocale(set)) {
    res.cookies.set(LOCALE_COOKIE, set, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return res;
}
