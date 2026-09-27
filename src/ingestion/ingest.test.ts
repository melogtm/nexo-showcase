import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { renderCnis } from "@/cnis/synthetic";
import { getAnalysis, ingest, listAnalyses } from "./ingest";

const cnis = () =>
  renderCnis({
    emitidoEm: "27/09/2026 10:15:00",
    filiado: { nit: "1", cpf: "000.000.000-00", nome: "FULANA", dataNascimento: "1980-01-01", nomeMae: "BELTRANA" },
    vinculos: [{ tipo: "EMPREGO", seq: 1, nit: "1", codigoEmp: "1", origem: "EMPRESA", dataInicio: "2010-01-01", tipoFiliado: "Empregado",
      remuneracoes: [{ competencia: "2010-01", valorCentavos: 100_000 }] }],
    legenda: [],
    ruido: ["texto inesperado"],
  });

test("parses the CNIS, stores the extraction with its SHA-256, and lists counts without the bytes", async () => {
  const pdf = await cnis();
  const { id, pdfSha256 } = await ingest("  Cliente A ", pdf);

  expect(pdfSha256).toBe(createHash("sha256").update(pdf).digest("hex"));
  const [row] = await listAnalyses();
  expect(row).toMatchObject({ id, clientLabel: "Cliente A", pdfSha256, status: "PARSED", vinculos: 1, unparsed: 1 });
  expect(row).not.toHaveProperty("pdf");
  const stored = await getAnalysis(id);
  expect(stored.extraction?.vinculos[0].remuneracoes[0].valorCentavos.value).toBe(100_000);
  expect(stored.parserVersion).toBe(1);
});

test("rejects a file that starts like a PDF but cannot be read", async () => {
  await expect(ingest("X", new TextEncoder().encode("%PDF-1.4 fake"))).rejects.toThrow("Não foi possível ler");
});

test("rejects non-PDF and blank label", async () => {
  await expect(ingest("X", new TextEncoder().encode("hello"))).rejects.toThrow("não é um PDF");
  await expect(ingest(" ", new TextEncoder().encode("%PDF-"))).rejects.toThrow("identificação");
});
