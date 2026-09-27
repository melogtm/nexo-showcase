import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { describe, expect, test } from "vitest";
import { renderCnis } from "@/cnis/synthetic";
import { getDb, schema } from "@/db";
import { ingest } from "@/ingestion/ingest";
import { contentHash } from "@/rules/core";
import { RULES, ruleKey } from "@/rules/registry";
import { recordEdits } from "@/timeline/review";
import { type RuleVersion, type ScenarioInput, evaluate } from "./evaluate";
import { ScenarioError, activeRuleVersions, createRun, rerun } from "./store";

// Fixture parameters are deliberately NOT the legal ones (ages, times, cut-off date, even days per year): the rules' logic is tested on its own,
// and the seeded legal parameters are only read from the database.
const version = (id: number, ruleCode: string, parameters: unknown): RuleVersion => ({
  id, ruleCode, version: 1, nome: ruleCode, legalBasis: "fixture", logicVersion: 1, parameters, contentHash: contentHash(parameters),
});
const FIXTURES = {
  art19: version(1, "EC103_ART19_PERMANENTE", { idadeMinimaAnos: { F: 30, M: 40 }, tempoMinimoAnos: { F: 2, M: 3 }, carenciaMinimaMeses: 12, diasPorAno: 360 }),
  art15: version(2, "EC103_ART15_PONTOS", { pontosBase: { F: 50, M: 60 }, anoBase: 2019, incrementoAnual: 1, pontosTeto: { F: 52, M: 62 }, tempoMinimoAnos: { F: 1, M: 1 }, carenciaMinimaMeses: 12, diasPorAno: 360 }),
  art16: version(3, "EC103_ART16_IDADE_PROGRESSIVA", { idadeBaseMeses: { F: 360, M: 480 }, anoBase: 2019, incrementoMesesPorAno: 6, idadeTetoMeses: { F: 372, M: 486 }, tempoMinimoAnos: { F: 1, M: 1 }, carenciaMinimaMeses: 12, diasPorAno: 360 }),
  art17: version(4, "EC103_ART17_PEDAGIO_50", { dataCorte: "2018-06-30", tempoMinimoAnos: { F: 5, M: 5 }, faltaMaximaAnosNaDataCorte: 2, pedagioPercentual: 50, carenciaMinimaMeses: 12, diasPorAno: 360 }),
  art20: version(5, "EC103_ART20_PEDAGIO_100", { dataCorte: "2018-06-30", idadeMinimaAnos: { F: 30, M: 40 }, tempoMinimoAnos: { F: 5, M: 5 }, pedagioPercentual: 100, carenciaMinimaMeses: 12, diasPorAno: 360 }),
};
const months = (from: string, to: string) => {
  const out: string[] = [];
  for (let m = Temporal.PlainYearMonth.from(from); Temporal.PlainYearMonth.compare(m, Temporal.PlainYearMonth.from(to)) <= 0; m = m.add({ months: 1 })) out.push(m.toString());
  return out;
};
const person = (sexo: "F" | "M", inicio: string, fim: string): ScenarioInput => ({
  nascimento: { value: "1990-01-01", source: { page: 1, line: 3, rawText: "01/01/1990" } },
  sexo, sexoEditIds: [],
  tempoIntervalos: [{ inicio, fim }],
  carencia: months(inicio.slice(0, 7), fim.slice(0, 7)),
  periodos: [{ key: "vinculo:0", seq: 1, origem: "EMPRESA", intervalos: [{ inicio, fim }], source: { page: 1, line: 9, rawText: "1 EMPRESA" }, editIds: [] }],
});
const run1 = (input: ScenarioInput, v: RuleVersion, ref: string) => evaluate(input, [v], ref).resultados[0];

describe("rule logic (fixture parameters)", () => {
  test("art. 19: eligible today; otherwise the projection waits for the last requirement (age)", () => {
    expect(run1(person("F", "2018-01-01", "2019-12-31"), FIXTURES.art19, "2020-06-30")).toMatchObject({ elegivelHoje: true, dataProjetada: "2020-06-30" });
    const m = run1(person("M", "2018-01-01", "2019-12-31"), FIXTURES.art19, "2020-06-30");
    expect(m.elegivelHoje).toBe(false);
    expect(m.requisitos.map((r) => [r.id, r.atendido])).toEqual([["idade", false], ["tempo", false], ["carencia", true]]);
    expect(m.dataProjetada).toBe("2030-01-01"); // 40th birthday; the missing time is reached earlier by continuous contribution
  });

  test("art. 17 applies only if, on the cut-off date, less than the maximum was missing; the toll is half of it", () => {
    const close = run1(person("F", "2014-07-01", "2020-12-31"), FIXTURES.art17, "2021-01-01"); // 1,461 days at the fictional cut-off
    expect(close.aplicavel).toBe(true);
    expect(close.requisitos.find((r) => r.id === "tempo")?.exigido).toBe(5 * 360 + Math.ceil((5 * 360 - 1461) / 2));
    const far = run1(person("F", "2016-07-01", "2020-12-31"), FIXTURES.art17, "2021-01-01"); // 730 days: too far
    expect(far).toMatchObject({ aplicavel: false, elegivelHoje: false, dataProjetada: null });
  });

  test("art. 17 v2 reports the cut-off condition as a numeric requirement (same parameters, same verdicts as v1)", () => {
    const v2 = { ...FIXTURES.art17, id: 6, version: 2, logicVersion: 2 };
    const close = run1(person("F", "2014-07-01", "2020-12-31"), v2, "2021-01-01");
    const far = run1(person("F", "2016-07-01", "2020-12-31"), v2, "2021-01-01");
    expect(far).toMatchObject({ aplicavel: false, elegivelHoje: false, dataProjetada: null });
    expect(far.requisitos).toEqual([{ id: "corte", label: "Tempo que faltava na data de corte", unidade: "dias", exigido: 2 * 360, atual: 5 * 360 - 730, atendido: false, param: "faltaMaximaAnosNaDataCorte", comparacao: "maximo" }]);
    const v1close = run1(person("F", "2014-07-01", "2020-12-31"), FIXTURES.art17, "2021-01-01");
    expect(close.requisitos.slice(1)).toEqual(v1close.requisitos);
    expect([close.elegivelHoje, close.dataProjetada]).toEqual([v1close.elegivelHoje, v1close.dataProjetada]);
  });

  test("art. 20 adds 100% of what was missing on the cut-off date", () => {
    const r = run1(person("F", "2014-07-01", "2020-12-31"), FIXTURES.art20, "2021-01-01");
    expect(r.requisitos.find((q) => q.id === "tempo")?.exigido).toBe(5 * 360 + (5 * 360 - 1461));
  });

  test("the projected date is the earliest one: met on it, not met the day before (all rules, both sexes)", () => {
    const ref = "2020-06-30";
    for (const v of Object.values(FIXTURES)) {
      for (const sexo of ["F", "M"] as const) {
        const input = person(sexo, "2015-11-14", "2020-06-30");
        const r = run1(input, v, ref);
        if (!r.dataProjetada || r.dataProjetada === ref) continue;
        const rule = RULES[ruleKey(v.ruleCode, 1)];
        const ctx = { nascimento: "1990-01-01", sexo, referencia: ref, tempoIntervalos: input.tempoIntervalos, carencia: input.carencia };
        const dayBefore = Temporal.PlainDate.from(r.dataProjetada).subtract({ days: 1 }).toString();
        expect(rule(ctx, v.parameters as never, r.dataProjetada).elegivel, `${v.ruleCode} ${sexo}`).toBe(true);
        if (dayBefore > ref) expect(rule(ctx, v.parameters as never, dayBefore).elegivel, `${v.ruleCode} ${sexo} day before`).toBe(false);
      }
    }
  });

  test("points rise each year up to the cap", () => {
    const at = (ref: string) => run1(person("M", "2015-01-01", "2015-12-31"), FIXTURES.art15, ref).requisitos.find((r) => r.id === "pontos")!.exigido;
    expect([at("2019-12-31"), at("2020-06-30"), at("2021-06-30"), at("2025-06-30")]).toEqual([60, 61, 62, 62]);
  });

  test("tampered parameters are refused, not silently evaluated", () => {
    const tampered = { ...FIXTURES.art19, parameters: { ...(FIXTURES.art19.parameters as object), carenciaMinimaMeses: 1 } };
    expect(() => evaluate(person("F", "2018-01-01", "2019-12-31"), [tampered], "2020-06-30")).toThrow("content_hash");
  });

  test("the trail links requirements to periods, their PDF source and the rule parameter", () => {
    const { trail } = evaluate(person("F", "2018-01-01", "2019-12-31"), [FIXTURES.art19], "2020-06-30");
    const tempo = trail.EC103_ART19_PERMANENTE.children!.find((c) => c.label === "Tempo de contribuição")!;
    expect(tempo.rule).toEqual({ code: "EC103_ART19_PERMANENTE", version: 1, param: "tempoMinimoAnos.F" });
    expect(tempo.children![0]).toMatchObject({ label: "1 · EMPRESA", source: { page: 1, line: 9 } });
  });
});

describe("calculation_run (database)", async () => {
  const pdf = await renderCnis({
    emitidoEm: "27/09/2026 10:15:00",
    filiado: { nit: "123.45678.90-1", cpf: "000.000.000-00", nome: "FULANA", dataNascimento: "1966-03-10", nomeMae: "BELTRANA" },
    vinculos: [{ tipo: "EMPREGO", seq: 1, nit: "123.45678.90-1", codigoEmp: "1", origem: "EMPRESA", dataInicio: "1990-01-01", dataFim: "2024-12-31", tipoFiliado: "Empregado",
      remuneracoes: months("1990-01", "2024-12").map((competencia) => ({ competencia, valorCentavos: 300_000 })) }],
    legenda: [],
  });

  test("every seeded rule version matches its content hash and has an implementation", async () => {
    const rows = await (await getDb()).select().from(schema.ruleVersion);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const r of rows) {
      expect(contentHash(r.parameters), r.ruleCode).toBe(r.contentHash);
      expect(RULES[ruleKey(r.ruleCode, r.logicVersion)], r.ruleCode).toBeDefined();
    }
  });

  test("a run needs the sexo; then re-running it reproduces the stored result exactly, even after a new rule version", async () => {
    const { id: analysisId } = await ingest("Cliente", pdf);
    await expect(createRun(analysisId, "2026-09-27")).rejects.toThrow(ScenarioError);
    await recordEdits(analysisId, [{ target: "filiado", field: "sexo", oldValue: null, newValue: "F", justificativa: null, editedBy: "nexo" }]);

    const runId = await createRun(analysisId, "2026-09-27");
    expect((await rerun(runId)).identical).toBe(true);

    // A new version of the points rule (stricter parameters) is inserted after the run.
    const [v1] = (await activeRuleVersions("2026-09-27")).filter((v) => v.ruleCode === "EC103_ART15_PONTOS");
    const p1 = v1.parameters as { pontosBase: { F: number; M: number } };
    const p2 = { ...p1, pontosBase: { F: p1.pontosBase.F + 5, M: p1.pontosBase.M + 5 } };
    const db = await getDb();
    await db.insert(schema.ruleVersion).values({
      ruleCode: v1.ruleCode, version: v1.version + 1, nome: v1.nome, validFrom: "2026-01-01", legalBasis: v1.legalBasis,
      parameters: p2, logicVersion: 1, contentHash: contentHash(p2),
    });

    const again = await rerun(runId);
    expect(again.identical).toBe(true); // the old run still uses the old version, by id
    const newRunId = await createRun(analysisId, "2026-09-27");
    const newRun = (await db.select().from(schema.calculationRun).where(sql`id = ${newRunId}`))[0];
    expect(newRun.result.find((r) => r.ruleCode === "EC103_ART15_PONTOS")?.version).toBe(v1.version + 1);

    // The comparison is not vacuous: a stored run whose result differs from what its inputs produce is caught.
    const stored = (await db.select().from(schema.calculationRun).where(sql`id = ${runId}`))[0];
    const altered = structuredClone(stored.result);
    altered[0].elegivelHoje = !altered[0].elegivelHoje;
    const [forged] = await db
      .insert(schema.calculationRun)
      .values({ ...stored, id: undefined, createdAt: undefined, result: altered } as never)
      .returning({ id: schema.calculationRun.id });
    expect((await rerun(forged.id)).identical).toBe(false);

    // History cannot be rewritten.
    const cause = (p: Promise<unknown>) => p.then(() => "no error", (e: Error) => String((e.cause as Error | undefined)?.message ?? e.message));
    expect(await cause(db.execute(sql`UPDATE rule_version SET nome = 'x'`))).toBe("rule_version is append-only");
    expect(await cause(db.execute(sql`DELETE FROM calculation_run`))).toBe("calculation_run is append-only");
  });
});
