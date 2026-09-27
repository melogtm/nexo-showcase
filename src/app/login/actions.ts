"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, createSession, credentials, credentialsMatch } from "@/auth";

// React resets the form after an action; `user` is echoed back so the field survives a failed attempt.
export type LoginState = { error?: string; user?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const creds = credentials();
  const user = String(form.get("user") ?? "");
  if (!creds || !credentialsMatch(creds, user, String(form.get("password") ?? ""))) {
    return { error: "Usuário ou senha incorretos.", user };
  }
  (await cookies()).set(SESSION_COOKIE, createSession(creds), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_S,
    path: "/",
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
