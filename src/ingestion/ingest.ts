import { createHash } from "node:crypto";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";

export const MAX_PDF_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5MB
const PDF_MAGIC = Buffer.from("%PDF-");

export class IngestionError extends Error {}

export async function ingest(clientLabel: string, pdf: Uint8Array) {
  const label = clientLabel.trim();
  if (!label) throw new IngestionError("Informe a identificação do cliente.");
  if (pdf.length > MAX_PDF_BYTES) throw new IngestionError("PDF maior que 4 MB.");
  if (!PDF_MAGIC.equals(pdf.subarray(0, PDF_MAGIC.length))) throw new IngestionError("O arquivo enviado não é um PDF.");

  const pdfSha256 = createHash("sha256").update(pdf).digest("hex");
  const [row] = await db.insert(schema.analysis).values({ clientLabel: label, pdfSha256, pdf }).returning({ id: schema.analysis.id });
  return { id: row.id, pdfSha256 };
}

/** List without the PDF bytes. */
export function listAnalyses() {
  const { id, createdAt, clientLabel, pdfSha256, status } = schema.analysis;
  return db.select({ id, createdAt, clientLabel, pdfSha256, status }).from(schema.analysis).orderBy(desc(createdAt));
}
