import { connection } from "next/server";
import { listAnalyses } from "@/ingestion/ingest";
import { UploadForm } from "./upload-form";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function Home() {
  await connection();
  const analyses = await listAnalyses();
  return (
    <>
      <section className="hero">
        <h1 className="display">
          Todo número, <em>auditável.</em>
        </h1>
        <p className="lede">Envie o extrato CNIS do cliente. O Nexo monta a linha do tempo contributiva e mostra de onde vem cada valor.</p>
      </section>

      <div className="grid">
        <UploadForm />

        <section className="card">
          <h2 className="eyebrow">Análises</h2>
          {analyses.length === 0 ? (
            <p className="muted">Nenhuma análise ainda. Envie o primeiro CNIS ao lado.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Cliente</th><th>Criada em</th><th>Status</th><th>PDF (SHA-256)</th></tr>
              </thead>
              <tbody>
                {analyses.map((a) => (
                  <tr key={a.id}>
                    <td>{a.clientLabel}</td>
                    <td>{dateTime.format(a.createdAt)}</td>
                    <td><span className="badge">{a.status === "UPLOADED" ? "Enviado" : a.status}</span></td>
                    <td><code title={a.pdfSha256}>{a.pdfSha256.slice(0, 8)}…{a.pdfSha256.slice(-4)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
