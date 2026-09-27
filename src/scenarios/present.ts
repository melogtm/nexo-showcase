import { brDate, brDuracao, brMoney, brNumber } from "@/format";
import type { Requisito } from "@/rules/core";
import type { Rmi } from "@/rules/ec103-art26.v1";
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

export const rmiValue = (rmi: Rmi) => (rmi.valorCentavos === null ? "Não estimado" : `R$ ${brMoney(rmi.valorCentavos)}`);
/** [VALIDAR] The simplifications of the RMI estimate (rule-engine §9), shown wherever a value is. */
export const RMI_RESSALVA =
  "Estimativa: sem teto nos salários, sem piso nem teto no benefício, períodos de benefício sem salário, e a média de hoje (na moeda do mês de correção) também para datas futuras.";
export function rmiBasis(rmi: Rmi) {
  if (rmi.valorCentavos === null) return rmi.motivo ?? "";
  const base = `${rmi.coeficientePct}% da média dos salários corrigidos`;
  return rmi.formula === "INTEGRAL" ? `${base} (percentual integral desta regra)` : `${base}, com ${rmi.anosContribuicao} anos de contribuição na data de elegibilidade`;
}

/** The rule reached first (today counts as earliest). Earliest is not "most advantageous": the benefit amount is not computed. */
export function earliest(rs: Resultado[]): Resultado | undefined {
  return rs.filter((r) => r.aplicavel && r.dataProjetada).sort((a, b) => a.dataProjetada!.localeCompare(b.dataProjetada!))[0];
}

const RANGES = /^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}(, \d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2})*$/;
/** Trail text is stored raw (ISO dates and months, `a..b` ranges, `N centavos`); make it readable, merging consecutive ranges. */
export function humanize(value: string) {
  const merged = RANGES.test(value)
    ? union(value.split(", ").map((r) => ({ inicio: r.slice(0, 10), fim: r.slice(12) }))).map((i) => `${i.inicio}..${i.fim}`).join(", ")
    : value;
  return merged
    .replace(/(\d{4})-(\d{2})-(\d{2})/g, "$3/$2/$1")
    .replace(/\b(\d{4})-(\d{2})\b/g, "$2/$1")
    .replace(/\b(\d+) centavos/g, (_, c: string) => `R$ ${brMoney(Number(c))}`)
    .replace(/\.\./g, " a ");
}

/** Value of a dotted parameter path such as `tempoMinimoAnos.F`. */
export function paramValue(parameters: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), parameters);
}
