import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, credentials, isValidSession } from "@/auth";

export function proxy(request: NextRequest) {
  const creds = credentials();
  if (!creds) return new NextResponse("NEXO_PASSWORD is not set.", { status: 503 });
  if (request.nextUrl.pathname === "/login" || isValidSession(creds, request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|icon.svg|nexo-logo.png).*)"] };
