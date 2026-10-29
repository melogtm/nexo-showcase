import { expect, test } from "vitest";
import { buildChecklist, documentsToRequest } from "./checklist";
import type { Periodo, Timeline } from "./timeline";

const periodo = (over: Partial<Periodo>): Periodo => ({
  key: "vinculo:0", seq: 1, origem: "EMPRESA", tipo: "EMPREGO", inicio: "2010-01-01", fim: "2012-12-31", fimInferido: false, status: "OK", confirmado: false,
  motivos: [], avisos: [], competencias: [], intervalos: [], source: { page: 1, line: 9, rawText: "" }, editIds: [], ...over,
});
const timeline = (periodos: Periodo[], over: Partial<Timeline> = {}): Timeline => ({
  periodos, sexo: "F", tempo: { dias: 0, intervalos: [] }, tempoEmAnalise: { dias: 0 }, carencia: { meses: 0, competencias: [] }, lacunas: [], concomitancias: [], ...over,
});

test("each open problem becomes a check with the documents that resolve it; decided vínculos drop out", () => {
  const items = buildChecklist(
    timeline(
      [
        periodo({ key: "vinculo:0", seq: 1, status: "REVISAR", fimInferido: true, fim: "2021-12-31", motivos: ["Sem data fim: inferida pela última competência (12/2021)"] }),
        periodo({ key: "vinculo:1", seq: 2, status: "PENDENTE", motivos: ["PEXT: Pendência de vínculo extemporâneo"], avisos: ["IEAN: possível período especial, contado como tempo comum. Enquadramento exige PPP/LTCAT."] }),
        periodo({ key: "vinculo:2", seq: 3, status: "OK", confirmado: true, fimInferido: true }),
        periodo({ key: "vinculo:3", seq: 4, status: "EXCLUIDO", motivos: ["PEXT: x"] }),
      ],
      { sexo: null, lacunas: [{ inicio: "2013-01-01", fim: "2014-12-31", dias: 730 }] },
    ),
    { unparsed: 1, nascimento: true },
  );
  expect(items.map((i) => i.id)).toEqual([
    "vinculo:0:fim",
    "vinculo:1:ind:PEXT: Pendência de vínculo extemporâneo",
    "naolidos",
    "sexo",
    "vinculo:1:especial",
    "lacuna:2013-01-01",
  ]);
  expect(items[0]).toMatchObject({ onde: "Vínculo 1 · EMPRESA", anchor: "#vinculo-0", prioridade: "ALTA", documentos: ["CTPS (página do contrato, com a data de saída)", "Termo de rescisão (TRCT)"] });
  expect(items.find((i) => i.id === "vinculo:1:especial")?.documentos).toContain("PPP (Perfil Profissiográfico Previdenciário)");

  const docs = documentsToRequest(items);
  expect(docs.map((d) => d.documento)).toContain("Termo de rescisão (TRCT)");
  expect(docs.some((d) => d.documento.startsWith("Conferir"))).toBe(false); // office tasks are not asked of the client
});

test("a clean timeline needs no checks", () => {
  expect(buildChecklist(timeline([periodo({})]), { unparsed: 0, nascimento: true })).toEqual([]);
});
