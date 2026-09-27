import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Single-user login (the public deploy stores CNIS PDFs, which carry personal data).
// Session cookie = "<expiresAtMs>.<hmac>", keyed by the password: changing NEXO_PASSWORD logs everyone out.
// ponytail: no rate limiting on /login; the generated password is 32 random chars. Add a limiter if the password gets weaker.

export const SESSION_COOKIE = "nexo_session";
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

export type Credentials = { user: string; password: string };

/** null in production without NEXO_PASSWORD: fail closed. */
export function credentials(): Credentials | null {
  const password = process.env.NEXO_PASSWORD ?? (process.env.NODE_ENV === "production" ? undefined : "nexo");
  return password ? { user: process.env.NEXO_USER ?? "nexo", password } : null;
}

const hmac = (key: string, data: string) => createHmac("sha256", key).update(data).digest();

function safeEqual(a: string, b: string) {
  return timingSafeEqual(hmac("cmp", a), hmac("cmp", b));
}

export function credentialsMatch(creds: Credentials, user: string, password: string) {
  return safeEqual(user, creds.user) && safeEqual(password, creds.password);
}

export function createSession(creds: Credentials, now = Date.now()) {
  const expires = String(now + SESSION_MAX_AGE_S * 1000);
  return `${expires}.${hmac(creds.password, `${creds.user}:${expires}`).toString("base64url")}`;
}

export function isValidSession(creds: Credentials, cookie: string | undefined, now = Date.now()) {
  const [expires, mac] = cookie?.split(".") ?? [];
  if (!expires || !mac || !(Number(expires) > now)) return false;
  return safeEqual(mac, hmac(creds.password, `${creds.user}:${expires}`).toString("base64url"));
}

/** Defence in depth behind src/proxy.ts: Server Actions and Route Handlers are reachable by direct request, so each re-checks. */
export async function requireSession() {
  const creds = credentials();
  if (!creds || !isValidSession(creds, (await cookies()).get(SESSION_COOKIE)?.value)) redirect("/login");
}
