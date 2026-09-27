import { describe, expect, test } from "vitest";
import type { CnisExtraction, Field, RawVinculo } from "@/cnis/parse";
import { buildTimeline, type Edit, type IndicatorCatalog } from "./timeline";

const src = { page: 1, line: 1, rawText: "x" };
const f = <T,>(value: T | null): Field<T> => ({ value, source: src });
type Spec = { inicio?: string | null; fim?: string | null; indicadores?: string[]; remuneracoes?: [string, number | null, string[]?][]; contribuicoes?: string[]; tipo?: "EMPREGO" | "BENEFICIO"; tipoFiliado?: string; problems?: string[] };
const vinculo = (seq: number, s: Spec): RawVinculo => ({
  tipo: s.tipo ?? "EMPREGO", source: src, seq: f(seq), origem: f(`EMPRESA ${seq}`), tipoFiliado: f(s.tipoFiliado ?? "Empregado"),
  dataInicio: f(s.inicio ?? null), dataFim: f(s.fim ?? null), indicadores: f(s.indicadores ?? null),
  remuneracoes: (s.remuneracoes ?? []).map(([c, v, ind]) => ({ competencia: f(c), valorCentavos: f(v), indicadores: f(ind ?? null), problems: [] })),
  contribuicoes: (s.contribuicoes ?? []).map((c) => ({ competencia: f(c), dataPagamento: f(`${c}-15`), contribuicaoCentavos: f(20_000), salarioContribuicaoCentavos: f(100_000), indicadores: f<string[]>(null), problems: [] })),
  problems: s.problems ?? [],
});
const cnis = (...vinculos: RawVinculo[]): CnisExtraction => ({ parserVersion: 1, filiado: { problems: [] }, vinculos, legenda: [], unparsed: [] });
const CATALOG: IndicatorCatalog = new Map([
  ["PEXT", { descricao: "Vínculo extemporâneo", efeito: "PENDENCIA" }],
  ["PREC-MENOR-MIN", { descricao: "Abaixo do mínimo", efeito: "PENDENCIA" }],
  ["IEAN", { descricao: "Agente nocivo", efeito: "CANDIDATO_ESPECIAL" }],
  ["INFO", { descricao: "Informativo", efeito: "INFORMATIVO" }],
]);
const build = (x: CnisExtraction, edits: Edit[] = []) => buildTimeline(x, edits, CATALOG);

describe("contribution time: inclusive days over the union of intervals", () => {
  test("overlapping vínculos count once; the overlap is reported", () => {
    const t = build(cnis(vinculo(1, { inicio: "2010-01-01", fim: "2010-12-31" }), vinculo(2, { inicio: "2010-07-01", fim: "2011-06-30" })));
    expect(t.tempo.dias).toBe(365 + 181);
    expect(t.concomitancias).toEqual([{ inicio: "2010-07-01", fim: "2010-12-31", dias: 184, a: "vinculo:0", b: "vinculo:1" }]);
    expect(t.lacunas).toEqual([]);
  });

  test("adjacent vínculos: no gap, no overlap", () => {
    const t = build(cnis(vinculo(1, { inicio: "2010-01-01", fim: "2010-12-31" }), vinculo(2, { inicio: "2011-01-01", fim: "2011-01-31" })));
    expect(t.tempo).toEqual({ dias: 365 + 31, intervalos: [{ inicio: "2010-01-01", fim: "2011-01-31" }] });
    expect([t.lacunas, t.concomitancias]).toEqual([[], []]);
  });

  test("leap year and a one-day vínculo", () => {
    expect(build(cnis(vinculo(1, { inicio: "2020-01-01", fim: "2020-12-31" }))).tempo.dias).toBe(366);
    expect(build(cnis(vinculo(1, { inicio: "2021-05-05", fim: "2021-05-05" }))).tempo.dias).toBe(1);
  });

  test("gaps are listed with their length", () => {
    const t = build(cnis(vinculo(1, { inicio: "2012-01-01", fim: "2012-01-31" }), vinculo(2, { inicio: "2012-03-01", fim: "2012-03-31" })));
    expect(t.lacunas).toEqual([{ inicio: "2012-02-01", fim: "2012-02-29", dias: 29 }]);
  });
});

describe("status and reasons", () => {
  test("no end date: inferred from the last competência, flagged REVISAR, not counted", () => {
    const t = build(cnis(vinculo(1, { inicio: "2015-02-01", remuneracoes: [["2015-02", 100_000], ["2015-03", 100_000]] })));
    expect(t.periodos[0]).toMatchObject({ fim: "2015-03-31", fimInferido: true, status: "REVISAR" });
    expect(t.periodos[0].motivos).toEqual(["Sem data fim: inferida pela última competência (03/2015)"]);
    expect(t.tempo.dias).toBe(0);
    expect(t.tempoEmAnalise.dias).toBe(28 + 31);
  });

  test("no end date and nothing to infer from", () => {
    const t = build(cnis(vinculo(1, { inicio: "2015-02-01" })));
    expect(t.periodos[0]).toMatchObject({ fim: null, status: "REVISAR", intervalos: [] });
  });

  test("indicators follow the catalog; unknown ones ask for review; special candidates only warn", () => {
    const t = build(cnis(
      vinculo(1, { inicio: "2010-01-01", fim: "2010-01-31", indicadores: ["PEXT"] }),
      vinculo(2, { inicio: "2011-01-01", fim: "2011-01-31", indicadores: ["XPTO"] }),
      vinculo(3, { inicio: "2012-01-01", fim: "2012-01-31", indicadores: ["IEAN", "INFO"] }),
    ));
    expect(t.periodos.map((p) => [p.status, p.motivos])).toEqual([
      ["PENDENTE", ["PEXT: Vínculo extemporâneo"]],
      ["REVISAR", ["Indicador desconhecido: XPTO"]],
      ["OK", []],
    ]);
    expect(t.periodos[2].avisos[0]).toMatch(/^IEAN: possível período especial/);
    expect(t.tempo.dias).toBe(31);
  });

  test("carência = distinct valid competências of counted vínculos; below-minimum is pending", () => {
    const t = build(cnis(
      vinculo(1, { inicio: "2020-01-01", fim: "2020-03-31", remuneracoes: [["2020-01", 100_000], ["2020-02", 50_000, ["PREC-MENOR-MIN"]], ["2020-03", null]] }),
      vinculo(2, { inicio: "2020-01-01", fim: "2020-01-31", remuneracoes: [["2020-01", 80_000]] }),
    ));
    expect(t.carencia).toEqual({ meses: 1, competencias: ["2020-01"] });
    expect(t.periodos[0].competencias.map((c) => c.status)).toEqual(["OK", "PENDENTE", "REVISAR"]);
  });

  test("benefit periods count as time (team decision) but not toward carência", () => {
    const t = build(cnis(vinculo(1, { tipo: "BENEFICIO", inicio: "2016-05-10", fim: "2016-09-06" })));
    expect(t.periodos[0]).toMatchObject({ tipo: "BENEFICIO", status: "OK" });
    expect(t.tempo.dias).toBe(120);
    expect(t.carencia.meses).toBe(0);
  });

  test("contribuinte individual counts paid competências as whole months", () => {
    const t = build(cnis(vinculo(1, { tipoFiliado: "Contribuinte Individual", inicio: "2022-01-01", contribuicoes: ["2022-01", "2022-02", "2022-04"] })));
    expect(t.periodos[0].tipo).toBe("CONTRIBUINTE");
    expect(t.tempo.dias).toBe(31 + 28 + 30);
    expect(t.lacunas).toEqual([{ inicio: "2022-03-01", fim: "2022-03-31", dias: 31 }]);
    expect(t.carencia.meses).toBe(3);
  });
});

describe("lawyer edits replay over the immutable extraction", () => {
  const extraction = cnis(vinculo(1, { inicio: "2015-02-01", indicadores: ["PEXT"], remuneracoes: [["2015-02", 100_000]] }));

  test("setting the end date and confirming makes the vínculo count", () => {
    const t = build(extraction, [
      { id: 1, target: "vinculo:0", field: "dataFim", newValue: "2015-12-31" },
      { id: 2, target: "vinculo:0", field: "decisao", newValue: "CONFIRMAR" },
    ]);
    expect(t.periodos[0]).toMatchObject({ fim: "2015-12-31", fimInferido: false, status: "OK", confirmado: true, editIds: [1, 2] });
    expect(t.periodos[0].motivos).toEqual(["PEXT: Vínculo extemporâneo"]); // kept for the record
    expect(t.tempo.dias).toBe(334);
    expect(extraction.vinculos[0].dataFim?.value).toBeNull(); // never mutated
  });

  test("last write wins; confirming is ignored while dates are unusable; excluding removes it", () => {
    const later = build(extraction, [
      { id: 2, target: "vinculo:0", field: "dataFim", newValue: "2015-06-30" },
      { id: 1, target: "vinculo:0", field: "dataFim", newValue: "2015-12-31" },
    ]);
    expect(later.periodos[0].fim).toBe("2015-06-30");
    const noDates = build(cnis(vinculo(1, {})), [{ id: 1, target: "vinculo:0", field: "decisao", newValue: "CONFIRMAR" }]);
    expect(noDates.periodos[0].status).toBe("REVISAR");
    const excluded = build(extraction, [{ id: 1, target: "vinculo:0", field: "decisao", newValue: "EXCLUIR" }]);
    expect(excluded.periodos[0].status).toBe("EXCLUIDO");
    expect(excluded.tempoEmAnalise.dias).toBe(0);
  });

  test("sexo comes from an edit on the filiado", () => {
    expect(build(extraction, [{ id: 1, target: "filiado", field: "sexo", newValue: "F" }]).sexo).toBe("F");
    expect(build(extraction).sexo).toBeNull();
  });
});
