import { Temporal } from "temporal-polyfill";
import type { CnisExtraction, SourceRef } from "@/cnis/parse";
import { type Requisito, type RuleContext, contentHash } from "@/rules/core";
import type { Rmi, RmiInput } from "@/rules/ec103-art26.v1";
import { RMI_RULES, RULES, ruleKey } from "@/rules/registry";
import type { Intervalo, Sexo, Timeline } from "@/timeline/timeline";

// evaluate(input, ruleVersions, referencia) → { resultados, trail }. Pure: the same arguments always give the same result,
// which is what makes a stored calculation_run re-executable (H2).

export type RuleVersion = {
  id: number;
  ruleCode: string;
  version: number;
  nome: string;
  legalBasis: string;
  logicVersion: number;
  parameters: unknown;
  contentHash: string;
};

/** The frozen inputs of a run: everything evaluate() reads. Stored as calculation_run.timeline_snapshot. */
export type ScenarioInput = {
  nascimento: { value: string; source: SourceRef } | null;
  sexo: Sexo | null;
  sexoEditIds: number[];
  tempoIntervalos: Intervalo[];
  carencia: string[];
  periodos: { key: string; seq: number | null; origem: string | null; intervalos: Intervalo[]; source: SourceRef; editIds: number[] }[];
} & Partial<RmiInput>; // absent in runs made before the RMI existed

export type Resultado = {
  ruleVersionId: number;
  ruleCode: string;
  version: number;
  nome: string;
  legalBasis: string;
  aplicavel: boolean;
  motivo?: string;
  elegivelHoje: boolean;
  requisitos: Requisito[];
  /** Earliest date the rule is met assuming continuous contribution after the reference date; null if not within the horizon. */
  dataProjetada: string | null;
  /** Estimated benefit amount, when the run used an RMI rule version. */
  rmi?: Rmi;
};

export type TrailNode = {
  label: string;
  value?: string;
  source?: SourceRef;
  editIds?: number[];
  rule?: { code: string; version: number; param?: string };
  children?: TrailNode[];
};

const HORIZONTE_ANOS = 60; // search window for the projection, not a legal parameter

export function scenarioInput(extraction: CnisExtraction, timeline: Timeline, sexoEditIds: number[]): ScenarioInput {
  const nascimento = extraction.filiado.dataNascimento;
  return {
    nascimento: nascimento?.value ? { value: nascimento.value, source: nascimento.source } : null,
    sexo: timeline.sexo,
    sexoEditIds,
    tempoIntervalos: timeline.tempo.intervalos,
    carencia: timeline.carencia.competencias,
    periodos: timeline.periodos
      .filter((p) => p.status === "OK")
      .map(({ key, seq, origem, intervalos, source, editIds }) => ({ key, seq, origem, intervalos, source, editIds })),
    salarios: salarios(timeline),
  };
}

/** [VALIDAR] Salários of counted competências; concurrent salários in the same month are summed (no teto applied). */
function salarios(timeline: Timeline): RmiInput["salarios"] {
  const byMonth = new Map<string, number>();
  for (const p of timeline.periodos.filter((x) => x.status === "OK")) {
    for (const c of p.competencias) if (c.status === "OK" && c.valorCentavos !== null) byMonth.set(c.competencia, (byMonth.get(c.competencia) ?? 0) + c.valorCentavos);
  }
  return [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([competencia, valorCentavos]) => ({ competencia, valorCentavos }));
}

export function missingInputs(input: ScenarioInput): string[] {
  return [...(input.sexo ? [] : ["Informe o sexo do segurado."]), ...(input.nascimento ? [] : ["Data de nascimento ausente no CNIS."])];
}

export function evaluate(input: ScenarioInput, versions: RuleVersion[], referencia: string): { resultados: Resultado[]; trail: Record<string, TrailNode> } {
  if (missingInputs(input).length) throw new Error(missingInputs(input).join(" "));
  const ctx: RuleContext = { nascimento: input.nascimento!.value, sexo: input.sexo!, referencia, tempoIntervalos: input.tempoIntervalos, carencia: input.carencia };
  const resultados: Resultado[] = [];
  const trail: Record<string, TrailNode> = {};
  const rmiVersions: RuleVersion[] = [];

  for (const v of versions) {
    if (contentHash(v.parameters) !== v.contentHash) throw new Error(`rule_version ${v.id}: parâmetros não conferem com o content_hash`);
    if (RMI_RULES[ruleKey(v.ruleCode, v.logicVersion)]) {
      rmiVersions.push(v);
      continue;
    }
    const rule = RULES[ruleKey(v.ruleCode, v.logicVersion)];
    if (!rule) throw new Error(`Sem implementação para ${ruleKey(v.ruleCode, v.logicVersion)}`);
    const params = v.parameters as never;
    const hoje = rule(ctx, params, referencia);
    const dataProjetada = !hoje.aplicavel ? null : hoje.elegivel ? referencia : project((d) => rule(ctx, params, d).elegivel, referencia);
    resultados.push({
      ruleVersionId: v.id, ruleCode: v.ruleCode, version: v.version, nome: v.nome, legalBasis: v.legalBasis,
      aplicavel: hoje.aplicavel, ...(hoje.motivo ? { motivo: hoje.motivo } : {}), elegivelHoje: hoje.elegivel, requisitos: hoje.requisitos, dataProjetada,
    });
    trail[v.ruleCode] = ruleTrail(input, v, hoje.requisitos, referencia);
  }

  for (const v of rmiVersions) {
    const rmiInput: RmiInput = { salarios: input.salarios ?? [], inpc: input.inpc ?? {}, correcaoAte: input.correcaoAte ?? null };
    const alvos = resultados.map((r) => ({ ruleCode: r.ruleCode, data: r.aplicavel ? r.dataProjetada : null }));
    const out = RMI_RULES[ruleKey(v.ruleCode, v.logicVersion)](ctx, v.parameters as never, rmiInput, alvos);
    for (const r of resultados) r.rmi = out.porRegra[r.ruleCode];
    const rule = (param?: string) => ({ code: v.ruleCode, version: v.version, ...(param ? { param } : {}) });
    trail[v.ruleCode] = {
      label: v.nome,
      value: `${v.legalBasis} · versão ${v.version} · ${v.contentHash.slice(0, 12)}`,
      rule: rule(),
      children: [
        {
          label: "Salário de benefício (média dos salários corrigidos)",
          value: out.salarioBeneficioCentavos === null ? "—" : `${out.salarioBeneficioCentavos} centavos · ${out.salarios.length} salários`,
          rule: rule("inicioPeriodoBasico"),
          children: out.salarios.map((s) => ({ label: s.competencia, value: `${s.valorCentavos} centavos × ${s.fator} = ${s.corrigidoCentavos} centavos` })),
        },
        { label: "Correção monetária", value: rmiInput.correcaoAte ? `INPC (IBGE, tabela 1736) até ${rmiInput.correcaoAte}` : "sem índice disponível" },
      ],
    };
  }
  return { resultados, trail };
}

/**
 * First date after `from` where `met` holds. Checks month ends, then the days of the first matching month.
 * ponytail: a window that opens and closes inside one month would be missed; rule requirements only jump on Jan 1,
 * which a Dec 31 check still catches.
 */
function project(met: (date: string) => boolean, from: string): string | null {
  const start = Temporal.PlainDate.from(from);
  const limit = start.add({ years: HORIZONTE_ANOS });
  let monthStart = start.add({ days: 1 });
  while (Temporal.PlainDate.compare(monthStart, limit) <= 0) {
    const monthEnd = monthStart.toPlainYearMonth().toPlainDate({ day: 1 }).add({ months: 1 }).subtract({ days: 1 });
    if (met(monthEnd.toString())) {
      for (let d = monthStart; Temporal.PlainDate.compare(d, monthEnd) <= 0; d = d.add({ days: 1 })) if (met(d.toString())) return d.toString();
    }
    monthStart = monthEnd.add({ days: 1 });
  }
  return null;
}

function ruleTrail(input: ScenarioInput, v: RuleVersion, requisitos: Requisito[], referencia: string): TrailNode {
  const rule = (param?: string) => ({ code: v.ruleCode, version: v.version, ...(param ? { param } : {}) });
  const periodNodes: TrailNode[] = input.periodos.map((p) => ({
    label: `${p.seq ?? "?"} · ${p.origem ?? "—"}`,
    value: p.intervalos.map((i) => `${i.inicio}..${i.fim}`).join(", "),
    source: p.source,
    ...(p.editIds.length ? { editIds: p.editIds } : {}),
  }));
  return {
    label: v.nome,
    value: `${v.legalBasis} · versão ${v.version} · ${v.contentHash.slice(0, 12)}`,
    rule: rule(),
    children: requisitos.map((r) => ({
      label: r.label,
      value: `${r.atual} / ${r.exigido} (${r.unidade}) em ${referencia}`,
      rule: rule(r.param),
      children:
        r.id === "idade"
          ? [{ label: "Data de nascimento", value: input.nascimento!.value, source: input.nascimento!.source }, { label: "Sexo", value: input.sexo!, ...(input.sexoEditIds.length ? { editIds: input.sexoEditIds } : {}) }]
          : r.id === "tempo" || r.id === "pontos" || r.id === "corte"
            ? periodNodes
            : r.id === "carencia"
              ? [{ label: "Competências válidas", value: String(input.carencia.length) }]
              : [],
    })),
  };
}
