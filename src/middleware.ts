import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/",
  "/setup",
  "/docs/webex-getting-started",
  "/docs/apple-mail-calendar-getting-started",
  "/api/setup",
  "/api/health",
  "/api/integrations/webex/webhook",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname === "/register") {
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  if (
    PUBLIC_PATHS.some((path) => pathname === path) ||
    pathname.startsWith("/api/integrations/") ||
    pathname.startsWith("/_next")
  ) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
