import { PASSWORD } from "./global-setup";
import { expect, test } from "./fixtures";

test.use({ storageState: { cookies: [], origins: [] } }); // this spec tests the login form itself

test("a protected page redirects to the login", async ({ page }) => {
  await page.goto("/analises");
  await expect(page).toHaveURL(/\/login/);
});

test("a wrong password shows an error and keeps the user", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Usuário").fill("nexo");
  await page.getByLabel("Senha").fill("errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Usuário ou senha incorretos." })).toBeVisible();
  await expect(page.getByLabel("Usuário")).toHaveValue("nexo");
});

test("login, then logout closes the session", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Usuário").fill(process.env.NEXO_USER ?? "nexo");
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
