import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Keep HTML / RSC navigations fresh so mandatory update checks roll out quickly.
 * Static chunks under `/_next/static` stay cacheable by Next's defaults.
 */
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/_next/static") || path.startsWith("/_next/image") || path === "/favicon.ico") {
    return NextResponse.next();
  }
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
