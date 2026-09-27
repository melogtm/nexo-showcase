import Link from "next/link";
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
                <tr><th>Cliente</th><th>Criada em</th><th>Vínculos</th><th>Não lidos</th><th>PDF (SHA-256)</th></tr>
              </thead>
              <tbody>
                {analyses.map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`/analises/${a.id}`}>{a.clientLabel}</Link></td>
                    <td>{dateTime.format(a.createdAt)}</td>
                    <td>{a.vinculos ?? "—"}</td>
                    <td>{a.unparsed ? <span className="badge">{a.unparsed}</span> : a.unparsed === 0 ? "0" : "—"}</td>
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
