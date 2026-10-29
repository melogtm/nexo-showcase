import { Temporal } from "temporal-polyfill";
import type { Resultado, ScenarioInput } from "./evaluate";
import { earliest } from "./present";

// "Alerta de aposentadoria": which clients reach a rule soon, from each analysis' latest ordinary run. Pure.

export type AlertInput = {
  analysisId: number;
  clientLabel: string;
  runId: number;
  referenceDate: string;
  result: Resultado[];
  premissas?: ScenarioInput["premissas"];
};
export type Alert = {
  analysisId: number;
  clientLabel: string;
  runId: number;
  ruleCode: string;
  ruleName: string;
  data: string;
  /** JA: the date has passed (or is today); PROXIMO: within the horizon. */
  kind: "JA" | "PROXIMO";
  meses: number; // whole months from today until `data` (0 when JA)
};

/**
 * One alert per analysis: its earliest rule, if reached within `horizonteMeses` from today.
 * Simulations (runs with premissas) are planning what-ifs, not the client's situation, so they are skipped.
 * `latest` must hold one run per analysis (its latest ordinary run). The horizon is a UI choice, not a legal parameter.
 */
export function retirementAlerts(latest: AlertInput[], hoje: string, horizonteMeses: number): Alert[] {
  const limit = Temporal.PlainDate.from(hoje).add({ months: horizonteMeses }).toString();
  return latest
    .filter((r) => !r.premissas)
    .flatMap((r) => {
      const first = earliest(r.result);
      if (!first?.dataProjetada || first.dataProjetada > limit) return [];
      const ja = first.dataProjetada <= hoje;
      const meses = ja ? 0 : Temporal.PlainDate.from(hoje).until(Temporal.PlainDate.from(first.dataProjetada), { largestUnit: "months" }).months;
      return [{ analysisId: r.analysisId, clientLabel: r.clientLabel, runId: r.runId, ruleCode: first.ruleCode, ruleName: first.nome, data: first.dataProjetada, kind: ja ? ("JA" as const) : ("PROXIMO" as const), meses }];
    })
    .sort((a, b) => a.data.localeCompare(b.data));
}
