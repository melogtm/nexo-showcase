import { Temporal } from "temporal-polyfill";
import { expect, newAnalysis, test, unique } from "./fixtures";

test("calculate, reproduce, trail, report, petition, simulation and the dashboard alert", async ({ page }) => {
  const label = unique("E2E perto de aposentar");
  const id = await newAnalysis(page, label, "cnis-exemplo-sintetico-2.pdf");

  await page.getByLabel(/Sexo do segurado/).selectOption("F");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Sexo do segurado informado")).toBeVisible();
  await page.getByRole("button", { name: "Calcular cenários" }).click();
  await page.waitForURL(new RegExp(`/analises/${id}/cenarios/\\d+$`));
  const runUrl = page.url();
  await expect(page.getByRole("heading", { name: "Comparativo das regras" })).toBeVisible();

  // H2: a re-run with the stored inputs gives the same result.
  await page.getByRole("button", { name: "Reexecutar e comparar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Resultado idêntico ao registrado" })).toBeVisible();

  // Every number opens its trail.
  const requirement = page.locator("details summary").first();
  await requirement.click();
  await expect(requirement.locator("xpath=..")).toHaveAttribute("open", "");

  const report = await page.request.get(`${runUrl}/relatorio`);
  expect(report.status()).toBe(200);
  expect(report.headers()["content-type"]).toContain("text/html");
  const minuta = await page.getByRole("link", { name: "Minuta", exact: true }).first().getAttribute("href");
  expect((await page.request.get(minuta!)).status()).toBe(200);

  // Planning: stop contributing on a date, compare with continuous contribution.
  const stop = Temporal.Now.plainDateISO("America/Sao_Paulo").add({ days: 400 }).toString();
  await page.getByLabel("Contribuições param em").fill(stop);
  await page.getByRole("button", { name: "Simular cenários" }).click();
  await expect(page.getByRole("heading", { name: /Simulação de planejamento/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Com contribuição contínua" })).toBeVisible();
  await page.goto(`/analises/${id}`);
  await expect(page.getByRole("link", { name: /^Para em / })).toBeVisible();

  await page.goto("/");
  await expect(page.locator("#alertas").getByRole("link", { name: label })).toBeVisible();
});
