import { NextResponse, type NextRequest } from "next/server";

export const VIA_COOKIE = "we_via";

/**
 * Share loop: links shared from a wish page carry ?s=1. Anyone landing on one
 * gets a short-lived cookie naming that wish, so a wish they make afterwards
 * is credited back to it ("N people wished after this").
 */
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (searchParams.get("s") === "1") {
    const id = pathname.split("/")[2];
    if (id) {
      const clean = req.nextUrl.clone();
      clean.searchParams.delete("s");
      const res = NextResponse.redirect(clean);
      res.cookies.set(VIA_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 7, sameSite: "lax", httpOnly: true });
      return res;
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/w/:id"] };
