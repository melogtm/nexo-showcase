import { expect, test } from "vitest";
import { ingest, listAnalyses } from "./ingest";

test("stores the PDF with its SHA-256 and lists it without the bytes", async () => {
  const { pdfSha256 } = await ingest("  Cliente A ", new TextEncoder().encode("%PDF-1.4 fake"));

  // sha256sum of the literal bytes "%PDF-1.4 fake"
  expect(pdfSha256).toBe("932d2676c1e461ba50d559bba416fbc6af8da1f74309ae81370c615223d0e349");
  const [row] = await listAnalyses();
  expect(row).toMatchObject({ clientLabel: "Cliente A", pdfSha256, status: "UPLOADED" });
  expect(row).not.toHaveProperty("pdf");
});

test("rejects non-PDF and blank label", async () => {
  await expect(ingest("X", new TextEncoder().encode("hello"))).rejects.toThrow("não é um PDF");
  await expect(ingest(" ", new TextEncoder().encode("%PDF-"))).rejects.toThrow("identificação");
});
