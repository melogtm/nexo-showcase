"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="stack">
      <h2 className="eyebrow">Acesso restrito</h2>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <label>
        Usuário
        <input name="user" autoComplete="username" required defaultValue={state.user} />
      </label>
      <label>
        Senha
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button type="submit" className="button" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
