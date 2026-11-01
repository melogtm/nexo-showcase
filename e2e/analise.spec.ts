import { expect, newAnalysis, test, unique } from "./fixtures";

test("dropping a non-PDF is refused before upload", async ({ page }) => {
  await page.goto("/analises");
  const transfer = await page.evaluateHandle(() => {
    const t = new DataTransfer();
    t.items.add(new File(["oi"], "notas.txt", { type: "text/plain" }));
    return t;
  });
  await page.locator(".dropzone").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByRole("alert").filter({ hasText: "Solte um arquivo PDF." })).toBeVisible();
});

test("upload, review a vínculo, and the audit trail records it", async ({ page }) => {
  const id = await newAnalysis(page, unique("E2E pendências"), "cnis-exemplo-sintetico.pdf");
  await expect(page.getByRole("heading", { name: "Linha do tempo" })).toBeVisible();

  // The example has rows to review: the "attention" tab lists them with the editor open.
  await page.getByRole("navigation", { name: "Filtrar vínculos" }).getByRole("link", { name: /Precisam de atenção/ }).click();
  await expect(page).toHaveURL(/ver=atencao/);
  const first = page.locator("ol.periodos > li").first();
  await first.getByLabel(/Justificativa/).fill("conferido na CTPS");
  await first.getByRole("button", { name: "Confirmar" }).click();
  // Confirmed, it leaves the attention list (and its editor) and lands in the history.
  await page.getByText(/Histórico de alterações \(1\)/).click();
  await expect(page.getByText("conferido na CTPS")).toBeVisible();

  await page.getByText(/Trechos não reconhecidos/).click();
  await expect(page.locator("#nao-lidos")).toBeVisible();

  const docs = await page.request.get(`/analises/${id}/documentos`);
  expect(docs.status()).toBe(200);
  expect(await docs.text()).toContain("documentos");
});
