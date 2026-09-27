import { sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { renderCnis } from "@/cnis/synthetic";
import { getDb } from "@/db";
import { ingest } from "@/ingestion/ingest";
import { listEdits, loadCatalog, loadReview, recordEdits } from "./review";

test("catalog is seeded; edits replay through loadReview; the log is append-only in the database", async () => {
  const catalog = await loadCatalog();
  expect(catalog.get("PEXT")?.efeito).toBe("PENDENCIA");

  const pdf = await renderCnis({
    emitidoEm: "27/09/2026 10:15:00",
    filiado: { nit: "123.45678.90-1", cpf: "000.000.000-00", nome: "FULANA", dataNascimento: "1980-01-01", nomeMae: "BELTRANA" },
    vinculos: [{ tipo: "EMPREGO", seq: 1, nit: "123.45678.90-1", codigoEmp: "1", origem: "EMPRESA", dataInicio: "2010-01-01", tipoFiliado: "Empregado", indicadores: ["PEXT"] }],
    legenda: [],
  });
  const { id } = await ingest("Cliente", pdf);
  expect((await loadReview(id))?.timeline?.periodos[0].status).toBe("REVISAR");

  await recordEdits(id, [
    { target: "vinculo:0", field: "dataFim", oldValue: null, newValue: "2010-12-31", justificativa: "CTPS", editedBy: "nexo" },
    { target: "vinculo:0", field: "decisao", oldValue: "", newValue: "CONFIRMAR", justificativa: "CTPS", editedBy: "nexo" },
  ]);
  const review = await loadReview(id);
  expect(review?.timeline?.periodos[0]).toMatchObject({ status: "OK", confirmado: true, fim: "2010-12-31" });
  expect(review?.timeline?.tempo.dias).toBe(365);

  const db = await getDb();
  const cause = (p: Promise<unknown>) => p.then(() => "no error", (e: Error) => String((e.cause as Error | undefined)?.message ?? e.message));
  expect(await cause(db.execute(sql`UPDATE manual_edit SET new_value = 'x'`))).toBe("manual_edit is append-only");
  expect(await cause(db.execute(sql`DELETE FROM manual_edit`))).toBe("manual_edit is append-only");
  expect(await listEdits(id)).toHaveLength(2);
});
