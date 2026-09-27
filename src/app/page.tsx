import { connection } from "next/server";
import { listAnalyses } from "@/ingestion/ingest";
import { UploadForm } from "./upload-form";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function Home() {
  await connection();
  const analyses = await listAnalyses();
  return (
    <main>
      <h1>Nexo</h1>
      <UploadForm />
      <h2>Análises</h2>
      {analyses.length === 0 ? (
        <p>Nenhuma análise ainda.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Cliente</th><th>Criada em</th><th>Status</th><th>SHA-256 do PDF</th></tr>
          </thead>
          <tbody>
            {analyses.map((a) => (
              <tr key={a.id}>
                <td>{a.clientLabel}</td>
                <td>{dateTime.format(a.createdAt)}</td>
                <td>{a.status}</td>
                <td><code>{a.pdfSha256}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
