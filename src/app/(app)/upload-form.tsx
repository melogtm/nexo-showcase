"use client";

import { useActionState, useState } from "react";
import { uploadAnalysis } from "./actions";

const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${number.format(bytes / 1024)} KB` : `${number.format(bytes / 1024 / 1024)} MB`);

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadAnalysis, {});
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    // React resets the form after the action, which empties the file input: onReset keeps the label in sync.
    <form action={action} onReset={() => setFile(null)} className="card card-accent">
      <h2 className="eyebrow">Nova análise</h2>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <label>
        Identificação do cliente
        <input name="clientLabel" required maxLength={200} placeholder="Ex.: Cliente 042" defaultValue={state.clientLabel} />
      </label>
      <label className={`dropzone${dragging ? " is-dragging" : ""}${file ? " has-file" : ""}`}>
        {/* The real input covers the zone, so click, keyboard and native drag-and-drop all work. */}
        <input
          type="file"
          name="pdf"
          accept="application/pdf"
          required
          onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDrop={() => setDragging(false)}
        />
        <svg aria-hidden="true" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M12 18v-6M9.5 14.5 12 12l2.5 2.5" />
        </svg>
        {file ? (
          <span className="dropzone-text">
            <strong>{file.name}</strong>
            <span className="muted">{formatSize(file.size)} · clique para trocar</span>
          </span>
        ) : (
          <span className="dropzone-text">
            <strong>Arraste o extrato CNIS aqui</strong>
            <span className="muted">ou clique para escolher · PDF até 4 MB</span>
          </span>
        )}
      </label>
      <button type="submit" className="button" disabled={pending}>{pending ? "Enviando…" : "Enviar CNIS"}</button>
    </form>
  );
}
