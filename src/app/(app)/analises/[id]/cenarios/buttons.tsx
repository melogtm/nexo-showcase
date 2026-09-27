"use client";

import { useActionState } from "react";
import { calcular, reexecutar } from "./actions";

export function CalcularButton({ analysisId }: { analysisId: number }) {
  const [state, action, pending] = useActionState(calcular.bind(null, analysisId), {});
  return (
    <form action={action} className="stack">
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>{pending ? "Calculando…" : "Calcular cenários"}</button>
    </form>
  );
}

export function ReexecutarButton({ runId }: { runId: number }) {
  const [state, action, pending] = useActionState(reexecutar.bind(null, runId), {});
  return (
    <form action={action} className="inline-form">
      <button type="submit" className="button button-quiet" disabled={pending}>{pending ? "Reexecutando…" : "Reexecutar e comparar"}</button>
      {state.identical === true && <span role="status">✓ Resultado idêntico ao registrado.</span>}
      {state.identical === false && <span className="error" role="alert">✗ O resultado mudou: o cálculo não é reprodutível.</span>}
      {state.error && <span className="error" role="alert">{state.error}</span>}
    </form>
  );
}
