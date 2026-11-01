import { buildCnj } from "@/processos/cnj";
import type { Page } from "@playwright/test";
import { expect, newAnalysis, test, unique } from "./fixtures";

test.describe.configure({ mode: "serial" });
// All five columns on screen: a drag whose target needs a scroll first is cancelled by the browser.
test.use({ viewport: { width: 1680, height: 1000 } });

test("the empty board loads the demo lawsuits", async ({ page }) => {
  await page.goto("/processos");
  await page.getByRole("button", { name: "Carregar 8 processos de exemplo" }).click();
  await expect(page.locator("article.kcard")).toHaveCount(7); // DELIBERATE FAILURE: artifact upload check
});

const NUMERO = buildCnj("0004242", "2024", "4", "03", "6301");
const imported = (page: Page) => page.getByRole("article", { name: new RegExp(NUMERO) });
const columnOf = async (page: Page) => (await imported(page).locator("xpath=ancestor::section[1]").getAttribute("id"))!;

test("import validates the CNJ number, then imports a valid one", async ({ page }) => {
  await page.goto("/processos");
  await page.locator("#importar > summary").click(); // collapsed once the board has cards
  await page.getByLabel("Número CNJ").fill("1234567-00.2024.4.03.6301");
  await page.getByRole("button", { name: "Importar" }).click();
  await expect(page.locator("p.error[role=alert]")).toBeVisible(); // Next's route announcer is an alert too

  await page.getByLabel("Número CNJ").fill(NUMERO);
  await page.getByLabel(/^Cliente/).fill("E2E importado");
  await page.getByRole("button", { name: "Importar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Processo importado" })).toBeVisible();
  await expect(page.locator("article.kcard")).toHaveCount(9);
});

test("drag a card to another column; the move persists and is marked Manual", async ({ page }) => {
  await page.goto("/processos");
  const target = (await columnOf(page)) === "col-CONCLUIDO" ? "col-NOVO" : "col-CONCLUIDO";
  await imported(page).dragTo(page.locator(`#${target}`), { steps: 5 }); // several dragover events, like a real drag
  await expect.poll(() => columnOf(page)).toBe(target);
  await page.reload();
  expect(await columnOf(page)).toBe(target);
  await expect(imported(page).getByText("Manual", { exact: true })).toBeVisible();
});

test("the Mover para select moves a card without dragging", async ({ page }) => {
  await page.goto("/processos");
  await imported(page).getByRole("combobox").selectOption("EM_JULGAMENTO");
  await expect.poll(() => columnOf(page)).toBe("col-EM_JULGAMENTO");
});

test("search and filters narrow the board; Sincronizar tudo reports back", async ({ page }) => {
  await page.goto("/processos");
  await page.getByLabel("Buscar processos").fill("E2E importado");
  await expect(page.locator("article.kcard")).toHaveCount(1);
  await page.getByLabel("Buscar processos").fill("");
  await page.getByLabel("Com análise vinculada").check();
  await expect(page.locator("article.kcard")).toHaveCount(0);
  await page.getByLabel("Com análise vinculada").uncheck();
  await page.getByLabel("Andamento nos últimos 7 dias").check();
  await page.getByLabel("Andamento nos últimos 7 dias").uncheck();
  await expect(page.locator("article.kcard")).toHaveCount(9);

  await page.getByRole("button", { name: "Sincronizar tudo" }).click();
  await expect(page.locator(".board-toolbar [role=status]")).not.toBeEmpty();
});

test("detail page: manual stage with a reason, back to automatic, link an analysis, sync", async ({ page }) => {
  const label = unique("E2E vinculada");
  await newAnalysis(page, label, "cnis-exemplo-sintetico.pdf");
  await page.goto("/processos");
  await page.getByRole("link", { name: NUMERO }).click();
  await page.waitForURL(/\/processos\/\d+$/);

  await page.getByLabel("Mover para").selectOption("RECURSO"); // the previous test left it in Em julgamento
  await page.getByLabel(/^Motivo/).fill("audiência marcada por telefone");
  await page.getByRole("button", { name: "Salvar etapa" }).click();
  await expect(page.getByText("audiência marcada por telefone").first()).toBeVisible();
  await page.getByRole("button", { name: "Voltar ao automático" }).click();
  await expect(page.getByRole("button", { name: "Voltar ao automático" })).toBeHidden();

  await page.getByLabel("Análise vinculada").selectOption({ label });
  await page.getByRole("button", { name: "Salvar vínculo" }).click();
  await expect(page.getByRole("link", { name: "Abrir cálculo" })).toBeVisible();

  await page.getByRole("button", { name: "Sincronizar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /Sem novidades|movimenta/ })).toBeVisible();
});
