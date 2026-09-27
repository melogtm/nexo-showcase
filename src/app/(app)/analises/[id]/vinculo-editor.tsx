"use client";

import { useActionState } from "react";
import type { Periodo } from "@/timeline/timeline";
import { saveVinculo } from "./actions";

/** Edit/confirm/exclude one vínculo. Every submit appends to the audit log; nothing is overwritten. */
export function VinculoEditor({ analysisId, periodo }: { analysisId: number; periodo: Periodo }) {
  const [state, action, pending] = useActionState(saveVinculo.bind(null, analysisId, periodo.key), {});
  const excluded = periodo.status === "EXCLUIDO";
  return (
    <form action={action} className="editor">
      {state.error && <p className="error small" role="alert">{state.error}</p>}
      {state.saved && <p className="small muted" role="status">Alteração registrada no histórico.</p>}
      {!excluded && (
        <div className="editor-dates">
          <label>
            Início
            <input type="date" name="inicio" defaultValue={periodo.inicio ?? ""} />
          </label>
          <label>
            Fim{periodo.fimInferido && <span className="muted"> (inferido)</span>}
            <input type="date" name="fim" defaultValue={periodo.fim ?? ""} />
          </label>
        </div>
      )}
      <label>
        Justificativa <span className="muted">(opcional)</span>
        <input name="justificativa" maxLength={500} placeholder="Ex.: conferido na CTPS" />
      </label>
      <div className="editor-actions">
        {excluded ? (
          <button type="submit" name="intent" value="reabrir" className="button" disabled={pending}>Reabrir</button>
        ) : (
          <>
            <button type="submit" name="intent" value="confirmar" className="button" disabled={pending}>Confirmar</button>
            <button type="submit" name="intent" value="salvar" className="button button-quiet" disabled={pending}>Salvar datas</button>
            <button type="submit" name="intent" value="excluir" className="button button-quiet" disabled={pending}>Excluir</button>
            {periodo.confirmado && <button type="submit" name="intent" value="reabrir" className="button button-quiet" disabled={pending}>Desfazer confirmação</button>}
          </>
        )}
      </div>
    </form>
  );
}
