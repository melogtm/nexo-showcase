import { type BySexo, type RuleContext, tempoDias } from "./core";

// Append-only: a behaviour change goes into ec103-art26.v2.ts plus a new rule_version row pointing at logic_version 2.
// RMI (renda mensal inicial) estimate. Money stays integer: centavos × index ratio in BigInt, rounded half-up once per step.

export type Formula = "COEFICIENTE" | "INTEGRAL" | "FATOR_PREVIDENCIARIO";
export type Art26Params = {
  inicioPeriodoBasico: string; // YYYY-MM: first competência that enters the average
  coeficienteBasePct: number;
  coeficienteIntegralPct: number; // formula INTEGRAL
  acrescimoPorAnoPct: number;
  anosSemAcrescimo: BySexo<number>; // whole years of contribution before the per-year increase starts
  diasPorAno: number;
  formulaPorRegra: Record<string, Formula>;
};

/** Frozen in the run snapshot: the salários and exactly the INPC numbers used to correct them. */
export type RmiInput = {
  salarios: { competencia: string; valorCentavos: number }[]; // counted competências, concurrent salários summed
  inpc: Record<string, string>; // YYYY-MM → index as an exact decimal string
  correcaoAte: string | null; // YYYY-MM the salários are corrected to (latest published index before the reference month)
};
export type Rmi = { formula: Formula | null; anosContribuicao: number | null; coeficientePct: number | null; valorCentavos: number | null; motivo?: string };
export type SalarioCorrigido = { competencia: string; valorCentavos: number; fator: string; corrigidoCentavos: number };
export type RmiOutcome = { salarioBeneficioCentavos: number | null; salarios: SalarioCorrigido[]; porRegra: Record<string, Rmi> };
export type RmiFn = (ctx: RuleContext, params: never, input: RmiInput, alvos: { ruleCode: string; data: string | null }[]) => RmiOutcome;

const SCALE = 13; // decimal places kept from the IBGE index
const scaled = (decimal: string) => {
  const [int, frac = ""] = decimal.split(".");
  return BigInt(int + frac.padEnd(SCALE, "0").slice(0, SCALE));
};
/** a / b rounded half-up, for non-negative a and positive b. */
const divRound = (a: bigint, b: bigint) => (2n * a + b) / (2n * b);
const ratio6 = (num: bigint, den: bigint) => {
  const r = divRound(num * 1_000_000n, den).toString().padStart(7, "0");
  return `${r.slice(0, -6)}.${r.slice(-6)}`;
};

export function art26v1(ctx: RuleContext, p: Art26Params, input: RmiInput, alvos: { ruleCode: string; data: string | null }[]): RmiOutcome {
  const alvo = input.correcaoAte;
  const salarios = input.salarios
    .filter((s) => s.competencia >= p.inicioPeriodoBasico)
    .map((s): SalarioCorrigido => {
      // [VALIDAR] factor = INPC(month the salários are corrected to) / INPC(competência); 1 from that month on.
      if (!alvo || s.competencia >= alvo) return { ...s, fator: "1.000000", corrigidoCentavos: s.valorCentavos };
      const [to, from] = [input.inpc[alvo], input.inpc[s.competencia]];
      if (!to || !from) throw new Error(`INPC ausente para ${from ? alvo : s.competencia}`);
      const [num, den] = [scaled(to), scaled(from)];
      return { ...s, fator: ratio6(num, den), corrigidoCentavos: Number(divRound(BigInt(s.valorCentavos) * num, den)) };
    });
  // [VALIDAR] EC 103, art. 26: simple average of 100% of the salários since 07/1994, divisor = number of salários.
  const salarioBeneficioCentavos = salarios.length
    ? Number(divRound(salarios.reduce((sum, s) => sum + BigInt(s.corrigidoCentavos), 0n), BigInt(salarios.length)))
    : null;

  const porRegra: Record<string, Rmi> = {};
  for (const { ruleCode, data } of alvos) {
    const formula = p.formulaPorRegra[ruleCode] ?? null;
    const none = (motivo: string): Rmi => ({ formula, anosContribuicao: null, coeficientePct: null, valorCentavos: null, motivo });
    if (!data) porRegra[ruleCode] = none("Regra não atingida: sem data para estimar o valor.");
    else if (!formula) porRegra[ruleCode] = none("Sem fórmula de cálculo definida para esta regra.");
    else if (formula === "FATOR_PREVIDENCIARIO") porRegra[ruleCode] = none("Usa o fator previdenciário (tábua de mortalidade do IBGE), fora do escopo do MVP.");
    else if (salarioBeneficioCentavos === null) porRegra[ruleCode] = none(`Sem salários desde ${p.inicioPeriodoBasico.split("-").reverse().join("/")}.`);
    else {
      const anos = Math.floor(tempoDias(ctx, data) / p.diasPorAno);
      const coeficientePct = formula === "INTEGRAL" ? p.coeficienteIntegralPct : p.coeficienteBasePct + p.acrescimoPorAnoPct * Math.max(0, anos - p.anosSemAcrescimo[ctx.sexo]);
      porRegra[ruleCode] = {
        formula, anosContribuicao: anos, coeficientePct,
        valorCentavos: Number(divRound(BigInt(salarioBeneficioCentavos) * BigInt(coeficientePct), 100n)),
      };
    }
  }
  return { salarioBeneficioCentavos, salarios, porRegra };
}
