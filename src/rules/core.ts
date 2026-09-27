import { createHash } from "node:crypto";
import { Temporal } from "temporal-polyfill";
import type { Intervalo, Sexo } from "@/timeline/timeline";

// Shared by every rule implementation. Changing what these helpers return changes results of old runs:
// the reproducibility test (src/scenarios/scenarios.test.ts) must stay green, or add new versioned helpers.

/** Everything a rule may look at. Built once per run from the timeline snapshot. */
export type RuleContext = {
  nascimento: string; // ISO date
  sexo: Sexo;
  referencia: string; // ISO date the run is "as of"
  tempoIntervalos: Intervalo[]; // counted contribution time (union), up to the reference date
  carencia: string[]; // YYYY-MM competências counted for carência
};

export type Unidade = "dias" | "meses" | "idadeMeses" | "pontos";
/**
 * Numbers only: formatting is the UI's job, so stored results compare exactly on re-run.
 * `comparacao: "maximo"` means `atual` must stay below `exigido` (default: reach at least `exigido`).
 */
export type Requisito = { id: string; label: string; unidade: Unidade; exigido: number; atual: number; atendido: boolean; param: string; comparacao?: "maximo" };
export type RuleOutcome = { aplicavel: boolean; motivo?: string; elegivel: boolean; requisitos: Requisito[] };
export type RuleFn = (ctx: RuleContext, params: never, data: string) => RuleOutcome;

export type BySexo<T> = { F: T; M: T };

const EPOCH = Temporal.PlainDate.from("1970-01-01");
export const epochDay = (iso: string) => EPOCH.until(Temporal.PlainDate.from(iso)).days;

/** Contribution days at `data`: the recorded time up to the reference date, plus continuous contribution after it. */
export function tempoDias(ctx: RuleContext, data: string): number {
  const ate = Math.min(epochDay(data), epochDay(ctx.referencia));
  let dias = 0;
  for (const i of ctx.tempoIntervalos) {
    const ini = epochDay(i.inicio);
    const fim = Math.min(epochDay(i.fim), ate);
    if (fim >= ini) dias += fim - ini + 1;
  }
  return dias + Math.max(0, epochDay(data) - epochDay(ctx.referencia));
}

/** Carência months at `data`: recorded competências up to the reference month, plus every month after it. */
export function carenciaMeses(ctx: RuleContext, data: string): number {
  const refMonth = Temporal.PlainYearMonth.from(ctx.referencia.slice(0, 7));
  const month = Temporal.PlainYearMonth.from(data.slice(0, 7));
  const upTo = Temporal.PlainYearMonth.compare(month, refMonth) < 0 ? month : refMonth;
  const recorded = ctx.carencia.filter((c) => Temporal.PlainYearMonth.compare(Temporal.PlainYearMonth.from(c), upTo) <= 0).length;
  return recorded + Math.max(0, refMonth.until(month, { largestUnit: "months" }).months);
}

/** Whole months of age at `data`. */
export const idadeMeses = (ctx: RuleContext, data: string) =>
  Temporal.PlainDate.from(ctx.nascimento).until(Temporal.PlainDate.from(data), { largestUnit: "months" }).months;

export const idadeDias = (ctx: RuleContext, data: string) => epochDay(data) - epochDay(ctx.nascimento);

export const year = (data: string) => Number(data.slice(0, 4));

/** Two decimals, floored: a requirement is met only when actually reached. */
export const floor2 = (n: number) => Math.floor(n * 100) / 100;

export const requisito = (r: Omit<Requisito, "atendido">, atendido = r.comparacao === "maximo" ? r.atual < r.exigido : r.atual >= r.exigido): Requisito => ({
  ...r,
  atendido,
});

// ---------- content hash (H2: a rule version is identified by what it says, not by its row) ----------

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export const contentHash = (parameters: unknown) => createHash("sha256").update(canonicalJson(parameters)).digest("hex");
