import { expect, test } from "vitest";
import type { Resultado } from "./evaluate";
import { bestValue, earliest, waitText } from "./present";

const r = (ruleCode: string, dataProjetada: string | null, valor: number | null, aplicavel = true): Resultado => ({
  ruleVersionId: 1, ruleCode, version: 1, nome: ruleCode, legalBasis: "", aplicavel, elegivelHoje: false, requisitos: [], dataProjetada,
  ...(valor === undefined ? {} : { rmi: { valorCentavos: valor } as Resultado["rmi"] }),
});

test("bestValue picks the highest estimate among reachable rules; earliest stays about dates", () => {
  const rs = [r("A", "2030-01-01", 200_000), r("B", "2028-01-01", 150_000), r("C", "2031-01-01", 250_000, false), r("D", null, 900_000), r("E", "2029-01-01", 200_000)];
  expect(bestValue(rs)?.ruleCode).toBe("E"); // tie on value → earlier date
  expect(earliest(rs)?.ruleCode).toBe("B");
  expect(bestValue([r("A", "2030-01-01", null)])).toBeUndefined();
});

test("waitText describes the wait from the reference date", () => {
  expect(waitText("2026-10-28", "2026-10-28")).toBe("hoje");
  expect(waitText("2026-10-28", null)).toBe("—");
  expect(waitText("2026-10-28", "2029-01-28")).toBe("em 2 anos e 3 meses");
  expect(waitText("2026-10-28", "2027-10-28")).toBe("em 1 ano");
  expect(waitText("2026-10-28", "2026-11-02")).toBe("em 5 dias");
});
