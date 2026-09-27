import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

// Single-user HTTP Basic auth: the public deploy stores CNIS PDFs, which carry personal data.
export function isAuthorized(header: string | null, user: string, password: string) {
  if (!header?.startsWith("Basic ")) return false;
  const given = Buffer.from(header.slice(6), "base64").toString();
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(`${user}:${password}`));
}

export function proxy(request: NextRequest) {
  const password = process.env.NEXO_PASSWORD ?? (process.env.NODE_ENV === "production" ? undefined : "nexo");
  if (!password) return new NextResponse("NEXO_PASSWORD is not set.", { status: 503 });
  if (isAuthorized(request.headers.get("authorization"), process.env.NEXO_USER ?? "nexo", password)) return NextResponse.next();
  return new NextResponse("Autenticação necessária.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Nexo"' } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
