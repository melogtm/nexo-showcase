import { expect, test } from "vitest";
import { brDate, brMoney, daysAgo } from "./format";

test("display formats: dates, money in integer centavos, relative São Paulo days", () => {
  expect(brDate("2026-11-01")).toBe("01/11/2026");
  expect(brMoney(123456)).toBe("1.234,56");
  expect(brMoney(5)).toBe("0,05");
  expect(daysAgo("2026-11-01", "2026-11-01")).toBe("hoje");
  expect(daysAgo("2026-10-31", "2026-11-01")).toBe("ontem");
  expect(daysAgo("2026-02-27", "2026-03-02")).toBe("há 3 dias"); // across a month end, no DST or UTC drift
});
