"use client";

import { useActionState } from "react";
import { uploadAnalysis } from "./actions";

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadAnalysis, {});
  return (
    <form action={action}>
      <h2>Nova análise</h2>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <label>
        Identificação do cliente
        <input name="clientLabel" required maxLength={200} />
      </label>
      <label>
        Extrato CNIS (PDF)
        <input type="file" name="pdf" accept="application/pdf" required />
      </label>
      <button type="submit" disabled={pending}>{pending ? "Enviando…" : "Enviar"}</button>
    </form>
  );
}
