import { type Page, test as base, expect } from "@playwright/test";
import MCR from "monocart-coverage-reports";
import { coverageOptions } from "./coverage";

/** Every test records the browser's JS coverage into the shared report (see e2e/run.ts). */
export const test = base.extend<{ coverage: void }>({
  coverage: [
    async ({ page }, use) => {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      await use();
      await MCR(coverageOptions).add(await page.coverage.stopJSCoverage());
    },
    { auto: true },
  ],
});
export { expect };

/** Uploads one of the public synthetic CNIS through the form on /analises and lands on its review page. Labels are unique per run. */
export async function newAnalysis(page: Page, label: string, pdf: "cnis-exemplo-sintetico.pdf" | "cnis-exemplo-sintetico-2.pdf") {
  await page.goto("/analises");
  await page.getByRole("textbox", { name: "Cliente", exact: true }).fill(label);
  await page.locator('input[name="pdf"]').setInputFiles(`public/${pdf}`);
  await page.getByRole("button", { name: "Enviar e ler o CNIS" }).click();
  await page.waitForURL(/\/analises\/\d+$/);
  return Number(new URL(page.url()).pathname.split("/").pop());
}
export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;
