import { createHash } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { type CnisExtraction, PARSER_VERSION, parseCnis } from "@/cnis/parse";
import { getDb, schema } from "@/db";

export const MAX_PDF_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5MB
const PDF_MAGIC = Buffer.from("%PDF-");

export class IngestionError extends Error {}

export async function ingest(clientLabel: string, pdf: Uint8Array) {
  const label = clientLabel.trim();
  if (!label) throw new IngestionError("Informe a identificação do cliente.");
  if (label.length > 200) throw new IngestionError("Identificação do cliente com mais de 200 caracteres.");
  if (pdf.length > MAX_PDF_BYTES) throw new IngestionError("PDF maior que 4 MB.");
  if (!PDF_MAGIC.equals(pdf.subarray(0, PDF_MAGIC.length))) throw new IngestionError("O arquivo enviado não é um PDF.");

  let extraction: CnisExtraction;
  try {
    extraction = await parseCnis(pdf);
  } catch (e) {
    console.error("parseCnis failed", e); // pdfjs/parser errors carry no extracted personal data
    throw new IngestionError("Não foi possível ler este PDF. Ele é o extrato CNIS baixado do Meu INSS?");
  }

  const pdfSha256 = createHash("sha256").update(pdf).digest("hex");
  const db = await getDb();
  const [row] = await db
    .insert(schema.analysis)
    .values({ clientLabel: label, pdfSha256, pdf, status: "PARSED", parserVersion: PARSER_VERSION, extraction })
    .returning({ id: schema.analysis.id });
  return { id: row.id, pdfSha256 };
}

/** List without the PDF bytes or the extraction, just its counts. */
export async function listAnalyses() {
  const { id, createdAt, clientLabel, pdfSha256, status, extraction } = schema.analysis;
  const db = await getDb();
  return db
    .select({
      id, createdAt, clientLabel, pdfSha256, status,
      vinculos: sql<number | null>`jsonb_array_length(${extraction}->'vinculos')`.mapWith(Number),
      unparsed: sql<number | null>`jsonb_array_length(${extraction}->'unparsed')`.mapWith(Number),
    })
    .from(schema.analysis)
    .orderBy(desc(createdAt));
}

export async function getAnalysis(analysisId: number) {
  const { id, createdAt, clientLabel, pdfSha256, status, parserVersion, extraction } = schema.analysis;
  const db = await getDb();
  const [row] = await db
    .select({ id, createdAt, clientLabel, pdfSha256, status, parserVersion, extraction })
    .from(schema.analysis)
    .where(eq(id, analysisId));
  return row;
}
