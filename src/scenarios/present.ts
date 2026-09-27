import { brDate, brDuracao, brNumber } from "@/format";
import type { Requisito } from "@/rules/core";
import { union } from "@/timeline/timeline";
import type { Resultado } from "./evaluate";

// Shared by the scenarios page and the exported report, so a number reads the same in both.

/** Display order: the permanent rule first, then the transitions in article order. */
const ORDER = ["EC103_ART19_PERMANENTE", "EC103_ART15_PONTOS", "EC103_ART16_IDADE_PROGRESSIVA", "EC103_ART17_PEDAGIO_50", "EC103_ART20_PEDAGIO_100"];
export const inDisplayOrder = (rs: Resultado[]) =>
  [...rs].sort((a, b) => (ORDER.indexOf(a.ruleCode) + 1 || 99) - (ORDER.indexOf(b.ruleCode) + 1 || 99));

const pontos = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function quantity(unidade: Requisito["unidade"], n: number) {
  if (unidade === "dias") return `${brDuracao(n)} (${brNumber(n)} dias)`;
  if (unidade === "meses") return `${n} meses`;
  if (unidade === "idadeMeses") return `${Math.floor(n / 12)} anos${n % 12 ? ` e ${n % 12} meses` : ""}`;
  return `${pontos.format(n)} pontos`;
}

export const requirementText = (q: Requisito) =>
  q.comparacao === "maximo" ? `${quantity(q.unidade, q.atual)} (máximo: ${quantity(q.unidade, q.exigido)})` : `${quantity(q.unidade, q.atual)} de ${quantity(q.unidade, q.exigido)}`;

export type Verdict = { kind: "yes" | "later" | "na"; text: string };
export function verdict(r: Resultado): Verdict {
  if (!r.aplicavel) return { kind: "na", text: "Não se aplica" };
  if (r.elegivelHoje) return { kind: "yes", text: "Elegível hoje" };
  if (r.dataProjetada) return { kind: "later", text: `Elegível em ${brDate(r.dataProjetada)}` };
  return { kind: "na", text: "Não atinge em 60 anos" };
}

/** The rule reached first (today counts as earliest). Earliest is not "most advantageous": the benefit amount is not computed. */
export function earliest(rs: Resultado[]): Resultado | undefined {
  return rs.filter((r) => r.aplicavel && r.dataProjetada).sort((a, b) => a.dataProjetada!.localeCompare(b.dataProjetada!))[0];
}

const RANGES = /^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}(, \d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2})*$/;
/** Trail values are stored raw (ISO dates, `a..b` ranges); make them readable, merging consecutive ranges. */
export function humanize(value: string) {
  const merged = RANGES.test(value)
    ? union(value.split(", ").map((r) => ({ inicio: r.slice(0, 10), fim: r.slice(12) }))).map((i) => `${i.inicio}..${i.fim}`).join(", ")
    : value;
  return merged.replace(/(\d{4})-(\d{2})-(\d{2})/g, "$3/$2/$1").replace(/\.\./g, " a ");
}

/** Value of a dotted parameter path such as `tempoMinimoAnos.F`. */
export function paramValue(parameters: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), parameters);
}
