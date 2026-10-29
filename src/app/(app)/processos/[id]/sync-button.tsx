"use client";

import { useActionState } from "react";
import { Icon } from "../../ui";
import { sincronizar } from "../actions";

export function SyncButton({ id }: { id: number }) {
  const [state, action, pending] = useActionState(sincronizar.bind(null, id), {});
  return (
    <form action={action} className="row">
      {(state.message || state.error) && <span className={`small ${state.error ? "error" : "muted"}`} role="status">{state.error ?? state.message}</span>}
      <button type="submit" className="button button-secondary" disabled={pending}><Icon name="refresh" /> {pending ? "Consultando…" : "Sincronizar"}</button>
    </form>
  );
}
