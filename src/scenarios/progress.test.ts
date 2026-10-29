import { expect, test } from "vitest";
import { nextStep } from "./progress";

const base = { lido: true, atencao: 0, sexo: true, nascimento: true, ultimoCalculoEm: null, ultimaEdicaoEm: null };

test("nextStep walks review → client data → calculate, and flags a stale calculation", () => {
  expect(nextStep({ ...base, lido: false }).step).toBe("SEM_LEITURA");
  expect(nextStep({ ...base, atencao: 2, sexo: false })).toEqual({ step: "REVISAR", label: "Revisar 2 vínculos", tone: "warn" });
  expect(nextStep({ ...base, sexo: false }).step).toBe("DADOS");
  expect(nextStep({ ...base, nascimento: false }).label).toBe("Nascimento ausente no CNIS");
  expect(nextStep(base).step).toBe("CALCULAR");
  const calc = new Date("2026-10-01T10:00:00Z");
  expect(nextStep({ ...base, ultimoCalculoEm: calc, ultimaEdicaoEm: new Date("2026-09-30T10:00:00Z") }).step).toBe("PRONTO");
  expect(nextStep({ ...base, ultimoCalculoEm: calc, ultimaEdicaoEm: new Date("2026-10-02T10:00:00Z") }).step).toBe("RECALCULAR");
});
