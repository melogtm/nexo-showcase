import { expect, test } from "vitest";
import type { Resultado, ScenarioInput } from "./evaluate";
import { renderReport } from "./report";

const resultado = (ruleCode: string, nome: string, dataProjetada: string | null): Resultado => ({
  ruleVersionId: 1, ruleCode, version: 1, nome, legalBasis: "base", aplicavel: true, elegivelHoje: false, dataProjetada,
  requisitos: [{ id: "tempo", label: "Tempo de contribuição", unidade: "dias", exigido: 730, atual: 365, atendido: false, param: "tempoMinimoAnos.F" }],
});
const input: ScenarioInput = {
  nascimento: { value: "1980-01-01", source: { page: 1, line: 3, rawText: "01/01/1980" } }, sexo: "F", sexoEditIds: [],
  tempoIntervalos: [], carencia: [],
  periodos: [{ key: "vinculo:0", seq: 1, origem: "EMPRESA <b>X</b>", intervalos: [{ inicio: "2010-01-01", fim: "2010-12-31" }], source: { page: 1, line: 9, rawText: "" }, editIds: [7] }],
};

test("the report escapes every user-supplied string, orders rules and names the earliest one", () => {
  const html = renderReport({
    runId: 3, clientLabel: `<script>alert("x")</script>`, filiado: { nome: "FULANA & CIA", nit: null }, referenceDate: "2026-09-27",
    createdAt: new Date("2026-09-27T12:00:00Z"), pdfSha256: "ab".repeat(32), input,
    resultados: [resultado("EC103_ART15_PONTOS", "Transição por pontos", "2040-01-01"), resultado("EC103_ART19_PERMANENTE", "Regra permanente", "2039-04-01")],
    versions: new Map(),
  });
  expect(html).not.toContain("<script>alert");
  expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  expect(html).toContain("FULANA &amp; CIA");
  expect(html).toContain("EMPRESA &lt;b&gt;X&lt;/b&gt;");
  expect(html.indexOf("Regra permanente")).toBeLessThan(html.indexOf("Transição por pontos")); // permanent rule first
  expect(html).toMatch(/Regra atingida mais cedo: <strong>Regra permanente<\/strong>/);
  expect(html).toContain("01/01/2010 a 31/12/2010");
  expect(html).toContain("edições nº 7");
  expect(html).toContain("este cálculo não estimou o valor do benefício"); // a run made before the RMI existed
});

test("the report shows each rule's estimated RMI and the corrected salários", () => {
  const withRmi = { ...resultado("EC103_ART19_PERMANENTE", "Regra permanente", "2039-04-01"), rmi: { formula: "COEFICIENTE" as const, anosContribuicao: 21, coeficientePct: 72, valorCentavos: 180_000 } };
  const html = renderReport({
    runId: 4, clientLabel: "C", filiado: { nome: null, nit: null }, referenceDate: "2026-09-27", createdAt: new Date("2026-09-27T12:00:00Z"), pdfSha256: "ab".repeat(32), input,
    resultados: [withRmi],
    rmiTrail: { label: "RMI", children: [{ label: "Salário de benefício", value: "250000 centavos · 1 salários", children: [{ label: "2019-01", value: "200000 centavos × 1.250000 = 250000 centavos" }] }, { label: "Correção", value: "INPC até 2026-08" }] },
    versions: new Map(),
  });
  expect(html).toContain("Valor estimado (RMI): <strong>R$ 1.800,00</strong>");
  expect(html).toContain("72% da média dos salários corrigidos, com 21 anos de contribuição");
  expect(html).toContain("<td>01/2019</td><td>R$ 2.000,00 × 1.250000 = R$ 2.500,00</td>");
  expect(html).toContain("INPC até 08/2026");
});

test("humanize merges consecutive ranges and formats dates", async () => {
  const { humanize } = await import("./present");
  expect(humanize("2022-01-01..2022-01-31, 2022-02-01..2022-02-28, 2022-04-01..2022-04-30")).toBe("01/01/2022 a 28/02/2022, 01/04/2022 a 30/04/2022");
  expect(humanize("2249 / 5475 (dias) em 2026-09-27")).toBe("2249 / 5475 (dias) em 27/09/2026");
  expect(humanize("2019-01")).toBe("01/2019");
  expect(humanize("123456 centavos × 1.333333 = 164608 centavos")).toBe("R$ 1.234,56 × 1.333333 = R$ 1.646,08");
});
