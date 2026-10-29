import { expect, test } from "vitest";
import { retirementAlerts } from "./alerts";
import type { Resultado } from "./evaluate";

const res = (ruleCode: string, dataProjetada: string | null, aplicavel = true): Resultado => ({
  ruleVersionId: 1, ruleCode, version: 1, nome: ruleCode, legalBasis: "", aplicavel, elegivelHoje: false, requisitos: [], dataProjetada,
});
const run = (analysisId: number, result: Resultado[], premissas?: { contribuicaoAte: string }) => ({ analysisId, clientLabel: `C${analysisId}`, runId: analysisId * 10, referenceDate: "2026-01-01", result, premissas });

test("alerts list the earliest rule of each client within the horizon, soonest first; simulations and far dates are left out", () => {
  const alerts = retirementAlerts(
    [
      run(1, [res("A", "2027-05-10"), res("B", "2026-12-01")]),
      run(2, [res("A", "2035-01-01")]),
      run(3, [res("A", "2026-03-01")]), // projected date already passed: eligible now
      run(4, [res("A", null), res("B", "2026-11-01", false)]),
      run(5, [res("A", "2026-11-15")], { contribuicaoAte: "2026-12-31" }),
    ],
    "2026-10-29",
    12,
  );
  expect(alerts.map((a) => [a.analysisId, a.ruleCode, a.kind, a.meses])).toEqual([
    [3, "A", "JA", 0],
    [1, "B", "PROXIMO", 1],
  ]);
});
