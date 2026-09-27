"use client";

import { useActionState } from "react";
import { uploadAnalysis } from "./actions";

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadAnalysis, {});
  return (
    <form action={action} className="card card-accent">
      <h2 className="eyebrow">Nova análise</h2>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <label>
        Identificação do cliente
        <input name="clientLabel" required maxLength={200} placeholder="Ex.: Cliente 042" defaultValue={state.clientLabel} />
      </label>
      <label>
        Extrato CNIS (PDF, até 4 MB)
        <input type="file" name="pdf" accept="application/pdf" required />
      </label>
      <button type="submit" className="button" disabled={pending}>{pending ? "Enviando…" : "Enviar CNIS"}</button>
    </form>
  );
}
