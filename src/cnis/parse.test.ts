import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { Line } from "./lines";
import { type Field, PARSER_VERSION, parseCnis, parseLines, type RawVinculo } from "./parse";
import { renderCnis, type SyntheticCnis } from "./synthetic";

const months = (from: string, count: number) =>
  Array.from({ length: count }, (_, i) => {
    const [y, m] = from.split("-").map(Number);
    const total = y * 12 + (m - 1) + i;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });

// One extract covering the cnis-domain §6 cases: no end date, overlap, gap, unknown indicator,
// below-minimum competência, contribuinte individual. Plus a benefit, a multi-page grid and wrapped legend text.
const CNIS: SyntheticCnis = {
  emitidoEm: "27/09/2026 10:15:00",
  filiado: { nit: "123.45678.90-1", cpf: "000.000.000-00", nome: "FULANA SINTÉTICA DE TAL", dataNascimento: "1975-04-22", nomeMae: "BELTRANA DE TAL" },
  vinculos: [
    {
      tipo: "EMPREGO", seq: 1, nit: "123.45678.90-1", codigoEmp: "11.111.111/0001-11", origem: "PADARIA EXEMPLO LTDA",
      dataInicio: "2005-03-01", dataFim: "2010-06-30", tipoFiliado: "Empregado", ultRemun: "2010-06",
      remuneracoes: months("2005-03", 7).map((competencia, i) => ({ competencia, valorCentavos: 45_000 + i * 1_000 })),
    },
    {
      tipo: "EMPREGO", seq: 2, nit: "123.45678.90-1", codigoEmp: "22.222.222/0001-22", origem: "METALÚRGICA FICTÍCIA S.A.",
      dataInicio: "2009-01-01", dataFim: "2012-12-31", tipoFiliado: "Empregado", ultRemun: "2012-12", indicadores: ["PEXT"],
      remuneracoes: [
        { competencia: "2009-01", valorCentavos: 123_456 },
        { competencia: "2009-02", valorCentavos: 123_456, indicadores: ["XPTO-NOVO"] },
        { competencia: "2009-03", valorCentavos: 1_234_567, indicadores: ["IEAN"] },
      ],
    },
    {
      tipo: "EMPREGO", seq: 3, nit: "123.45678.90-1", codigoEmp: "33.333.333/0001-33", origem: "COMÉRCIO SEM DATA FIM ME",
      dataInicio: "2015-02-01", tipoFiliado: "Empregado", ultRemun: "2021-12",
      remuneracoes: months("2015-02", 83).map((competencia) => ({
        competencia,
        valorCentavos: competencia === "2020-03" ? 50_000 : 250_000,
        indicadores: competencia === "2020-03" ? ["PREC-MENOR-MIN"] : undefined,
      })),
    },
    {
      tipo: "BENEFICIO", seq: 4, nit: "123.45678.90-1", nb: "1234567890", origem: "Benefício",
      especie: "80 - AUXILIO SALARIO MATERNIDADE", dataInicio: "2016-05-10", dataFim: "2016-09-06", situacao: "CESSADO",
    },
    {
      tipo: "EMPREGO", seq: 5, nit: "123.45678.90-1", codigoEmp: "", origem: "RECOLHIMENTO",
      dataInicio: "2022-01-01", dataFim: "2022-06-30", tipoFiliado: "Contribuinte Individual",
      contribuicoes: months("2022-01", 6).map((competencia) => ({
        competencia, dataPagamento: `${competencia}-15`, contribuicaoCentavos: 26_664, salarioContribuicaoCentavos: 121_200,
      })),
    },
  ],
  legenda: [
    { codigo: "PEXT", descricao: "Pendência de vínculo extemporâneo" },
    { codigo: "PREC-MENOR-MIN", descricao: "Recolhimento abaixo do valor mínimo, que não conta para o tempo de contribuição nem para a carência sem complementação" },
    { codigo: "IEAN", descricao: "Exposição a agente nocivo informada pelo empregador" },
  ],
  ruido: ["*** Observação manuscrita que o parser não conhece ***"],
};

const values = <T,>(f: Field<T> | undefined) => f?.value ?? null;

describe("parseCnis on a synthetic extract", async () => {
  const extraction = await parseCnis(await renderCnis(CNIS));

  test("reads the filiado", () => {
    const { filiado } = extraction;
    expect([filiado.nit, filiado.cpf, filiado.nome, filiado.dataNascimento, filiado.nomeMae].map(values))
      .toEqual(["123.45678.90-1", "000.000.000-00", "FULANA SINTÉTICA DE TAL", "1975-04-22", "BELTRANA DE TAL"]);
    expect(filiado.problems).toEqual([]);
  });

  test("reads every vínculo with its fields", () => {
    const summary = (v: RawVinculo) => ({
      tipo: v.tipo, seq: values(v.seq), origem: values(v.origem), dataInicio: values(v.dataInicio), dataFim: values(v.dataFim),
      tipoFiliado: values(v.tipoFiliado), indicadores: values(v.indicadores), especie: values(v.especie), situacao: values(v.situacao),
    });
    expect(extraction.vinculos.map(summary)).toEqual([
      { tipo: "EMPREGO", seq: 1, origem: "PADARIA EXEMPLO LTDA", dataInicio: "2005-03-01", dataFim: "2010-06-30", tipoFiliado: "Empregado", indicadores: null, especie: null, situacao: null },
      { tipo: "EMPREGO", seq: 2, origem: "METALÚRGICA FICTÍCIA S.A.", dataInicio: "2009-01-01", dataFim: "2012-12-31", tipoFiliado: "Empregado", indicadores: ["PEXT"], especie: null, situacao: null },
      { tipo: "EMPREGO", seq: 3, origem: "COMÉRCIO SEM DATA FIM ME", dataInicio: "2015-02-01", dataFim: null, tipoFiliado: "Empregado", indicadores: null, especie: null, situacao: null },
      { tipo: "BENEFICIO", seq: 4, origem: "Benefício", dataInicio: "2016-05-10", dataFim: "2016-09-06", tipoFiliado: null, indicadores: null, especie: "80 - AUXILIO SALARIO MATERNIDADE", situacao: "CESSADO" },
      { tipo: "EMPREGO", seq: 5, origem: "RECOLHIMENTO", dataInicio: "2022-01-01", dataFim: "2022-06-30", tipoFiliado: "Contribuinte Individual", indicadores: null, especie: null, situacao: null },
    ]);
    expect(extraction.vinculos.flatMap((v) => v.problems)).toEqual([]);
  });

  test("reads every remuneração, in order, including one continued across pages", () => {
    CNIS.vinculos.forEach((expected, i) => {
      const got = extraction.vinculos[i].remuneracoes.map((r) => [values(r.competencia), values(r.valorCentavos), values(r.indicadores)]);
      const want = expected.tipo === "EMPREGO" ? (expected.remuneracoes ?? []).map((r) => [r.competencia, r.valorCentavos, r.indicadores ?? null]) : [];
      expect(got).toEqual(want);
    });
    const pages = new Set(extraction.vinculos[2].remuneracoes.map((r) => r.competencia.source.page));
    expect(pages.size).toBeGreaterThan(1);
  });

  test("reads contribuições of the contribuinte individual", () => {
    const got = extraction.vinculos[4].contribuicoes.map((c) => [values(c.competencia), values(c.dataPagamento), values(c.contribuicaoCentavos), values(c.salarioContribuicaoCentavos)]);
    expect(got).toEqual(months("2022-01", 6).map((m) => [m, `${m}-15`, 26_664, 121_200]));
  });

  test("reads the legend, joining wrapped descriptions", () => {
    expect(extraction.legenda.map((l) => [values(l.codigo), values(l.descricao)])).toEqual(CNIS.legenda.map((l) => [l.codigo, l.descricao]));
  });

  test("never drops text: the unexpected line becomes an UnparsedFragment with its location", () => {
    expect(extraction.unparsed).toEqual([{ page: 1, line: expect.any(Number), rawText: CNIS.ruido![0] }]);
  });

  test("every field points back to its page and line", () => {
    const isField = (f: unknown): f is Field<unknown> => !!f && typeof f === "object" && "source" in f && "value" in f;
    const fieldsOf = (o: object) => (Object.values(o) as unknown[]).filter(isField);
    const fields = extraction.vinculos.flatMap((v) => [...fieldsOf(v), ...[...v.remuneracoes, ...v.contribuicoes].flatMap(fieldsOf)]);
    expect(fields.length).toBeGreaterThan(300);
    for (const f of fields) {
      expect(f.source.page).toBeGreaterThanOrEqual(1);
      expect(f.source.line).toBeGreaterThanOrEqual(1);
      if (f.value !== null) expect(f.source.rawText).not.toBe("");
    }
    expect(extraction.parserVersion).toBe(PARSER_VERSION);
  });
});

// Hand-built lines: the edge cases a generator would never produce.
const at = (page: number, line: number, cells: [string, number][]): Line => ({
  page, line, segments: cells.map(([text, x]) => ({ text, x, width: text.length * 3.5 })),
});
const HEADER: [string, number][] = [["Seq.", 30], ["NIT", 60], ["Código Emp.", 140], ["Origem do Vínculo", 240], ["Data Início", 440], ["Data Fim", 500], ["Tipo Filiado no Vínculo", 560], ["Últ. Remun.", 670], ["Indicadores", 730]];

describe("parseLines edge cases", () => {
  test("an impossible date is kept as unreadable and flagged, not dropped", () => {
    const { vinculos } = parseLines([at(1, 1, HEADER), at(1, 2, [["1", 30], ["EMPRESA X", 240], ["31/02/2020", 440], ["Empregado", 560]])]);
    expect(vinculos[0].dataInicio).toEqual({ value: null, source: { page: 1, line: 2, rawText: "31/02/2020" } });
    expect(vinculos[0].problems).toEqual(['Data Início ilegível: "31/02/2020"']);
  });

  test("a header column the parser does not know flags its values", () => {
    const { vinculos } = parseLines([at(1, 1, [...HEADER, ["Nova Coluna", 800]]), at(1, 2, [["1", 30], ["EMPRESA X", 240], ["01/01/2020", 440], ["ABC", 800]])]);
    expect(vinculos[0].problems).toEqual(['Coluna não reconhecida "Nova Coluna": "ABC"']);
  });

  test("text before any table, and a grid without a vínculo, are unparsed", () => {
    const { unparsed } = parseLines([
      at(1, 1, [["Algum texto solto", 30]]),
      at(1, 2, [["Competência", 30], ["Remuneração", 100], ["Indicadores", 180]]),
      at(1, 3, [["01/2020", 30], ["1.000,00", 100]]),
    ]);
    expect(unparsed.map((u) => [u.line, u.rawText])).toEqual([[1, "Algum texto solto"], [3, "01/2020 1.000,00"]]);
  });

  test("a garbled grid cell is unparsed while its neighbours are read", () => {
    const grid: [string, number][] = [["Competência", 30], ["Remuneração", 100], ["Indicadores", 180], ["Competência", 300], ["Remuneração", 370], ["Indicadores", 450]];
    const { vinculos, unparsed } = parseLines([at(1, 1, HEADER), at(1, 2, [["1", 30], ["EMPRESA X", 240], ["01/01/2020", 440]]), at(1, 3, grid), at(1, 4, [["01/2020", 30], ["1.000,00", 100], ["O1/2O2O", 300], ["9,99", 370]])]);
    expect(vinculos[0].remuneracoes.map((r) => r.competencia.value)).toEqual(["2020-01"]);
    expect(unparsed.map((u) => u.rawText)).toEqual(["O1/2O2O 9,99"]);
  });

  test("page chrome is matched whole-line: extra text merged into the footer is unparsed, not skipped", () => {
    const footer = "O INSS poderá rever a qualquer tempo as informações constantes deste extrato, conforme art. 19, § 3° do Decreto 3.048/99.";
    const { unparsed } = parseLines([at(1, 1, [[footer, 30]]), at(1, 2, [[footer, 30], ["Obs.: vínculo em análise", 700]])]);
    expect(unparsed.map((u) => u.line)).toEqual([2]);
  });

  test("an unknown label inside the filiado block is flagged, not absorbed silently", () => {
    const { filiado } = parseLines([at(1, 1, [["NIT: 123.45678.90-1", 30], ["Novo Campo: X", 150], ["CPF: 000.000.000-00", 250]])]);
    expect(filiado.nit?.value).toBeNull();
    expect(filiado.nit?.source.rawText).toBe("123.45678.90-1 Novo Campo: X");
    expect(filiado.problems).toEqual(["NIT ilegível"]);
    expect(filiado.cpf?.value).toBe("000.000.000-00");
  });

  test("the filiado block repeats per page; a disagreement is flagged without echoing the data", () => {
    const { filiado } = parseLines([at(1, 1, [["CPF: 111.111.111-11", 30]]), at(2, 1, [["CPF: 222.222.222-22", 30]])]);
    expect(filiado.cpf?.value).toBe("111.111.111-11");
    expect(filiado.problems).toEqual(["CPF diverge entre páginas"]);
  });
});

// The sample offered for download on the public site must keep parsing.
test("the downloadable synthetic sample parses", async () => {
  const extraction = await parseCnis(new Uint8Array(readFileSync("public/cnis-exemplo-sintetico.pdf")));
  expect(extraction.vinculos).toHaveLength(5);
  expect(extraction.vinculos.flatMap((v) => v.problems)).toEqual([]);
  expect(extraction.unparsed.map((u) => u.rawText)).toEqual(["*** Observação manuscrita que o parser não conhece ***"]);
});

// Local-only smoke test against public model extracts (fixtures/real/ is gitignored).
const REAL = "fixtures/real/unilab-modelo.pdf";
test.skipIf(!existsSync(REAL))("parses the public UNILAB model extract without losing text", async () => {
  const extraction = await parseCnis(new Uint8Array(readFileSync(REAL)));
  expect(extraction.vinculos.map((v) => [v.tipo, values(v.especie)]).slice(0, 2)).toEqual([["BENEFICIO", "80 - AUXILIO SALARIO MATERNIDADE"], ["BENEFICIO", "80 - AUXILIO SALARIO MATERNIDADE"]]);
  expect(extraction.legenda.map((l) => values(l.descricao))).toEqual(["Remuneração informada fora do prazo, passível de comprovação"]);
  expect(extraction.unparsed).toEqual([]);
});
