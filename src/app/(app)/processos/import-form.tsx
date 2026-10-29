"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Icon } from "../ui";
import { importar } from "./actions";

/**
 * Import by CNJ number. The client can be an existing analysis (links the lawsuit to its calculation) or free text.
 * Collapsed by default so the board gets the screen; opens when the board is empty or the URL ends in #importar.
 */
export function ImportForm({ analyses, demo, defaultOpen }: { analyses: { id: number; clientLabel: string }[]; demo: boolean; defaultOpen: boolean }) {
  const [state, action, pending] = useActionState(importar, {});
  const details = useRef<HTMLDetailsElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.location.hash === "#importar" && details.current) {
      details.current.open = true;
      input.current?.focus();
    }
  }, []);

  return (
    <details className="card section" id="importar" open={defaultOpen} ref={details}>
      <summary>
        <span className="row"><Icon name="plus" /> Importar processo {demo ? "(modo demonstração)" : "do Jusbrasil"}</span>
      </summary>
      <form action={action} className="card-body">
        {state.error && <p className="error" role="alert">{state.error}</p>}
        {state.importedId && (
          <p className="success small" role="status">
            Processo importado. <Link href={`/processos/${state.importedId}`}>Abrir</Link>
          </p>
        )}
        <div className="form-grid import-grid">
          <label>
            Número CNJ
            <input ref={input} name="numero" required inputMode="numeric" placeholder="0000000-00.0000.0.00.0000" defaultValue={state.numero} className="mono" autoComplete="off" />
          </label>
          <label>
            Vincular à análise <span className="hint">(opcional)</span>
            <select name="analysisId" defaultValue="">
              <option value="">Nenhuma</option>
              {analyses.map((a) => <option key={a.id} value={a.id}>{a.clientLabel}</option>)}
            </select>
          </label>
          <label>
            Cliente <span className="hint">(se não houver análise)</span>
            <input name="clientLabel" maxLength={200} placeholder="Ex.: João P." />
          </label>
          <button type="submit" className="button" disabled={pending}>{pending ? "Consultando…" : "Importar"}</button>
        </div>
        <p className="muted small">
          {demo
            ? "Sem token do Jusbrasil configurado: os dados do processo são sintéticos, gerados a partir do número. Configure JUSBRASIL_API_TOKEN para consultar dados reais."
            : "Os dados vêm da consulta processual do Jusbrasil. A coluna é definida pela última movimentação reconhecida e você pode mudá-la a qualquer momento."}
        </p>
      </form>
    </details>
  );
}
