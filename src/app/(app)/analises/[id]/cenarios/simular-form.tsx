"use client";

import { useActionState } from "react";
import { Icon } from "../../../ui";
import { simular } from "./actions";

/** "E se o cliente parar de contribuir em…?" Runs the same rules with that premise and opens the result. */
export function SimularForm({ analysisId, hoje, defaultDate, disabled = false }: { analysisId: number; hoje: string; defaultDate?: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(simular.bind(null, analysisId), {});
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      {state.error && <p className="error small" role="alert">{state.error}</p>}
      <label>
        Contribuições param em
        <input type="date" name="contribuicaoAte" min={hoje} defaultValue={defaultDate} required disabled={disabled} />
      </label>
      <button type="submit" className="button button-secondary" disabled={pending || disabled}>
        <Icon name="calc" /> {pending ? "Simulando…" : "Simular cenários"}
      </button>
    </form>
  );
}
