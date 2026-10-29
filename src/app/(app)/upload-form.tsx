"use client";

import { type DragEvent, useActionState, useRef, useState } from "react";
import { uploadAnalysis } from "./actions";

const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${number.format(bytes / 1024)} KB` : `${number.format(bytes / 1024 / 1024)} MB`);

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadAnalysis, {});
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Explicit drop handling: native drops onto a hidden file input are not honoured by every browser.
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (!dropped || !input.current) return;
    if (dropped.type !== "application/pdf" && !dropped.name.toLowerCase().endsWith(".pdf")) {
      setDropError("Solte um arquivo PDF.");
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(dropped);
    input.current.files = transfer.files;
    setDropError(null);
    setFile(dropped);
  };

  return (
    // React resets the form after the action, which empties the file input: onReset keeps the label in sync.
    <form action={action} onReset={() => setFile(null)} className="card accent" id="nova">
      <div className="card-header">
        <h2 className="card-title">Nova análise</h2>
        <span className="muted small">CNIS em PDF · até 4 MB</span>
      </div>
      <div className="card-body">
        {state.error && <p className="error" role="alert">{state.error}</p>}
        <label>
          Cliente
          <input name="clientLabel" required maxLength={200} placeholder="Ex.: Maria S. · pasta 042" defaultValue={state.clientLabel} />
        </label>
        {dropError && <p className="error" role="alert">{dropError}</p>}
        <label
          className={`dropzone${dragging ? " is-dragging" : ""}${file ? " has-file" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {/* The real input covers the zone for click and keyboard; drops are handled by the label above. */}
          <input
            ref={input}
            type="file"
            name="pdf"
            accept="application/pdf"
            required
            onChange={(e) => {
              setDropError(null);
              setFile(e.currentTarget.files?.[0] ?? null);
            }}
          />
          <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
              <span className="muted">ou clique para escolher o arquivo</span>
            </span>
          )}
        </label>
        <button type="submit" className="button button-block" disabled={pending}>{pending ? "Lendo o CNIS…" : "Enviar e ler o CNIS"}</button>
        <p className="muted small">
          Sem um CNIS à mão? Baixe um exemplo sintético: <a href="/cnis-exemplo-sintetico.pdf" download>cliente de 51 anos, com pendências</a> ou{" "}
          <a href="/cnis-exemplo-sintetico-2.pdf" download>cliente perto de se aposentar</a>. Nesta instância, use apenas dados fictícios.
        </p>
      </div>
    </form>
  );
}
