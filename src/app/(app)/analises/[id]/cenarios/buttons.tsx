"use client";

import { useActionState } from "react";
import { Icon } from "../../../ui";
import { calcular, reexecutar } from "./actions";

export function CalcularButton({ analysisId, label = "Calcular cenários", block = false, disabled = false }: { analysisId: number; label?: string; block?: boolean; disabled?: boolean }) {
  const [state, action, pending] = useActionState(calcular.bind(null, analysisId), {});
  return (
    <form action={action} className="stack" style={{ gap: 6 }}>
      {state.error && <p className="error small" role="alert">{state.error}</p>}
      <button type="submit" className={`button${block ? " button-block" : ""}`} disabled={pending || disabled}>
        <Icon name="calc" /> {pending ? "Calculando…" : label}
      </button>
    </form>
  );
}

export function ReexecutarButton({ runId }: { runId: number }) {
  const [state, action, pending] = useActionState(reexecutar.bind(null, runId), {});
  return (
    <form action={action} className="row">
      {state.identical === true && <span className="success small" role="status">✓ Resultado idêntico ao registrado</span>}
      {state.identical === false && <span className="error small" role="alert">✗ O resultado mudou: não é reprodutível</span>}
      {state.error && <span className="error small" role="alert">{state.error}</span>}
      <button type="submit" className="button button-secondary" disabled={pending}><Icon name="refresh" /> {pending ? "Reexecutando…" : "Reexecutar e comparar"}</button>
    </form>
  );
}
