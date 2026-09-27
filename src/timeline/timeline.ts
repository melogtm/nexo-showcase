import { Temporal } from "temporal-polyfill";
import type { CnisExtraction, RawVinculo, SourceRef } from "@/cnis/parse";
import { brMonth } from "@/format";

// buildTimeline(extraction, edits, catalog) → Timeline. Pure: no DB, no clock.
// The raw extraction is never mutated; lawyer edits (manual_edit rows) are replayed on top, last write wins.

export type Efeito = "PENDENCIA" | "REVISAR" | "CANDIDATO_ESPECIAL" | "INFORMATIVO";
export type IndicatorCatalog = Map<string, { descricao: string; efeito: Efeito }>;

export type Edit = { id: number; target: string; field: string; newValue: string };
/** Edit targets: `vinculo:<n>` (n-th vínculo of the extraction: dataInicio | dataFim | decisao) or `filiado` (sexo). */
export type Decisao = "CONFIRMAR" | "EXCLUIR" | "";
export type Sexo = "F" | "M";

export type Status = "OK" | "PENDENTE" | "REVISAR" | "EXCLUIDO";
export type Intervalo = { inicio: string; fim: string }; // ISO dates, inclusive

export type Competencia = { competencia: string; valorCentavos: number | null; status: "OK" | "PENDENTE" | "REVISAR"; motivos: string[] };
export type Periodo = {
  key: string;
  seq: number | null;
  origem: string | null;
  tipo: "EMPREGO" | "BENEFICIO" | "CONTRIBUINTE";
  inicio: string | null;
  fim: string | null;
  fimInferido: boolean;
  status: Status;
  confirmado: boolean;
  motivos: string[];
  avisos: string[]; // shown, but do not change status (e.g. special-period candidate)
  competencias: Competencia[];
  /** What this período contributes to the contribution-time union (empty when it does not count). */
  intervalos: Intervalo[];
  source: SourceRef;
  editIds: number[];
};
export type Timeline = {
  periodos: Periodo[];
  sexo: Sexo | null;
  tempo: { dias: number; intervalos: Intervalo[] }; // counted: status OK only
  tempoEmAnalise: { dias: number }; // PENDENTE/REVISAR períodos with usable dates, not counted
  carencia: { meses: number; competencias: string[] };
  lacunas: (Intervalo & { dias: number })[];
  concomitancias: (Intervalo & { dias: number; a: string; b: string })[];
};

const SEVERITY: Record<Status, number> = { OK: 0, PENDENTE: 1, REVISAR: 2, EXCLUIDO: 3 };
const worst = <S extends Status>(a: S, b: S): S => (SEVERITY[b] > SEVERITY[a] ? b : a);

const date = (iso: string) => Temporal.PlainDate.from(iso);
const monthStart = (ym: string) => `${ym}-01`;
const monthEnd = (ym: string) => Temporal.PlainYearMonth.from(ym).toPlainDate({ day: 1 }).add({ months: 1 }).subtract({ days: 1 }).toString();
/** Inclusive day count. */
export const dias = ({ inicio, fim }: Intervalo) => date(inicio).until(date(fim)).days + 1;
const nextDay = (iso: string) => date(iso).add({ days: 1 }).toString();
const prevDay = (iso: string) => date(iso).subtract({ days: 1 }).toString();

export function isIsoDate(s: string) {
  try {
    return Temporal.PlainDate.from(s, { overflow: "reject" }).toString() === s;
  } catch {
    return false;
  }
}

export function buildTimeline(extraction: CnisExtraction, edits: Edit[], catalog: IndicatorCatalog): Timeline {
  const byTarget = new Map<string, Map<string, { value: string; id: number }>>();
  const editIds = new Map<string, number[]>();
  for (const e of [...edits].sort((a, b) => a.id - b.id)) {
    if (!byTarget.has(e.target)) byTarget.set(e.target, new Map());
    byTarget.get(e.target)!.set(e.field, { value: e.newValue, id: e.id });
    editIds.set(e.target, [...(editIds.get(e.target) ?? []), e.id]);
  }

  const periodos = extraction.vinculos.map((v, i) => {
    const key = `vinculo:${i}`;
    const fields = byTarget.get(key) ?? new Map();
    return buildPeriodo(v, key, (f) => fields.get(f)?.value, catalog, editIds.get(key) ?? []);
  });

  const sexo = byTarget.get("filiado")?.get("sexo")?.value;
  const counted = periodos.filter((p) => p.status === "OK");
  const recorded = periodos.filter((p) => p.status !== "EXCLUIDO");
  const tempoIntervalos = union(counted.flatMap((p) => p.intervalos));
  const emAnalise = union(periodos.filter((p) => p.status === "PENDENTE" || p.status === "REVISAR").flatMap((p) => p.intervalos));

  const carencia = [...new Set(counted.flatMap((p) => p.competencias.filter((c) => c.status === "OK" && c.valorCentavos !== null).map((c) => c.competencia)))].sort();

  return {
    periodos,
    sexo: sexo === "F" || sexo === "M" ? sexo : null,
    tempo: { dias: tempoIntervalos.reduce((n, i) => n + dias(i), 0), intervalos: tempoIntervalos },
    tempoEmAnalise: { dias: subtract(emAnalise, tempoIntervalos).reduce((n, i) => n + dias(i), 0) },
    carencia: { meses: carencia.length, competencias: carencia },
    lacunas: gaps(union(recorded.flatMap((p) => p.intervalos))),
    concomitancias: overlaps(recorded),
  };
}

function buildPeriodo(v: RawVinculo, key: string, edited: (field: string) => string | undefined, catalog: IndicatorCatalog, editIds: number[]): Periodo {
  const motivos: string[] = [];
  const avisos: string[] = [];
  let status: Status = "OK";
  const flag = (s: Status, motivo: string) => {
    status = worst(status, s);
    motivos.push(motivo);
  };
  const applyIndicators = (codes: string[] | null | undefined, on: (s: "PENDENTE" | "REVISAR", motivo: string) => void) => {
    for (const code of codes ?? []) {
      const entry = catalog.get(code);
      if (!entry) on("REVISAR", `Indicador desconhecido: ${code}`);
      else if (entry.efeito === "PENDENCIA") on("PENDENTE", `${code}: ${entry.descricao}`);
      else if (entry.efeito === "REVISAR") on("REVISAR", `${code}: ${entry.descricao}`);
      else if (entry.efeito === "CANDIDATO_ESPECIAL") avisos.push(`${code}: possível período especial, contado como tempo comum. Enquadramento exige PPP/LTCAT.`);
    }
  };

  const contribuinte = v.contribuicoes.length > 0 || /contribuinte individual|facultativo/i.test(v.tipoFiliado?.value ?? "");
  const tipo = v.tipo === "BENEFICIO" ? "BENEFICIO" : contribuinte ? "CONTRIBUINTE" : "EMPREGO";

  for (const p of v.problems) flag("REVISAR", `Leitura: ${p}`);
  applyIndicators(v.indicadores?.value, flag);

  const competencias: Competencia[] = [...v.remuneracoes, ...v.contribuicoes]
    .filter((r) => r.competencia.value !== null)
    .map((r) => {
      const c: Competencia = {
        competencia: r.competencia.value!,
        valorCentavos: "valorCentavos" in r ? r.valorCentavos.value : r.salarioContribuicaoCentavos.value,
        status: "OK",
        motivos: r.problems.map((p) => `Leitura: ${p}`),
      };
      if (c.motivos.length || c.valorCentavos === null) c.status = "REVISAR";
      if (c.valorCentavos === null) c.motivos.push("Valor ilegível");
      applyIndicators(r.indicadores.value, (s, motivo) => {
        c.status = worst(c.status, s);
        c.motivos.push(motivo);
      });
      return c;
    });
  const ultima = competencias.map((c) => c.competencia).sort().at(-1);

  // Dates: lawyer edits win over the extraction; a missing end date may be inferred from the last competência.
  const inicioEditado = edited("dataInicio");
  const fimEditado = edited("dataFim");
  const inicio = inicioEditado || v.dataInicio?.value || null;
  let fim = fimEditado || v.dataFim?.value || null;
  let fimInferido = false;
  if (!inicio) flag("REVISAR", "Data de início ausente ou ilegível");
  if (!fim && tipo !== "CONTRIBUINTE") {
    if (ultima) {
      fim = monthEnd(ultima);
      fimInferido = true;
      flag("REVISAR", `Sem data fim: inferida pela última competência (${brMonth(ultima)})`);
    } else {
      flag("REVISAR", "Sem data fim e sem remunerações para inferi-la");
    }
  }
  if (inicio && fim && Temporal.PlainDate.compare(date(inicio), date(fim)) > 0) flag("REVISAR", "Data de início posterior à data fim");
  if (tipo === "BENEFICIO") avisos.push("Benefício: conta como tempo de contribuição (decisão da equipe); não entra na carência até confirmação.");

  const decisao = edited("decisao") as Decisao | undefined;
  const confirmado = decisao === "CONFIRMAR";
  const datesUsable = !!inicio && !!fim && Temporal.PlainDate.compare(date(inicio), date(fim)) <= 0;
  if (decisao === "EXCLUIR") status = "EXCLUIDO";
  else if (confirmado && datesUsable) {
    // The lawyer vouches for the vínculo and its competências; the reasons stay visible for the record.
    status = "OK";
    for (const c of competencias) if (c.valorCentavos !== null) c.status = "OK";
  }

  // [VALIDAR] Contribuinte individual/facultativo counts by paid competências (whole months), not by the vínculo range.
  const intervalos: Intervalo[] =
    tipo === "CONTRIBUINTE"
      ? competencias.filter((c) => c.status === "OK").map((c) => ({ inicio: monthStart(c.competencia), fim: monthEnd(c.competencia) }))
      : datesUsable
        ? [{ inicio: inicio!, fim: fim! }]
        : [];

  return {
    key, seq: v.seq.value, origem: v.origem?.value ?? v.especie?.value ?? null, tipo,
    inicio, fim, fimInferido, status, confirmado, motivos, avisos, competencias, intervalos,
    source: v.source, editIds,
  };
}

/** Merges overlapping and adjacent intervals. */
export function union(intervals: Intervalo[]): Intervalo[] {
  const sorted = [...intervals].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const out: Intervalo[] = [];
  for (const i of sorted) {
    const last = out.at(-1);
    if (last && i.inicio <= nextDay(last.fim)) {
      if (i.fim > last.fim) last.fim = i.fim;
    } else out.push({ ...i });
  }
  return out;
}

/** Parts of `a` not covered by `b` (both already unions). */
function subtract(a: Intervalo[], b: Intervalo[]): Intervalo[] {
  let rest = a;
  for (const cut of b) {
    rest = rest.flatMap((i) => {
      if (cut.fim < i.inicio || cut.inicio > i.fim) return [i];
      const parts: Intervalo[] = [];
      if (cut.inicio > i.inicio) parts.push({ inicio: i.inicio, fim: prevDay(cut.inicio) });
      if (cut.fim < i.fim) parts.push({ inicio: nextDay(cut.fim), fim: i.fim });
      return parts;
    });
  }
  return rest;
}

function gaps(merged: Intervalo[]) {
  return merged.slice(1).map((next, i) => {
    const gap = { inicio: nextDay(merged[i].fim), fim: prevDay(next.inicio) };
    return { ...gap, dias: dias(gap) };
  });
}

function overlaps(periodos: Periodo[]) {
  const out: Timeline["concomitancias"] = [];
  periodos.forEach((a, i) =>
    periodos.slice(i + 1).forEach((b) => {
      for (const x of a.intervalos)
        for (const y of b.intervalos) {
          const inicio = x.inicio > y.inicio ? x.inicio : y.inicio;
          const fim = x.fim < y.fim ? x.fim : y.fim;
          if (inicio <= fim) out.push({ inicio, fim, dias: dias({ inicio, fim }), a: a.key, b: b.key });
        }
    }),
  );
  return out;
}
