import { type FullConfig, chromium } from "@playwright/test";

export const STATE = "test-results/.auth/state.json";
export const PASSWORD = process.env.NEXO_PASSWORD ?? "e2e";

/** Logs in once through the real form; every spec reuses the session (auth.spec opts out to test the form itself). */
export default async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto("/login");
  await page.getByLabel("Usuário").fill(process.env.NEXO_USER ?? "nexo");
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/");
  await page.context().storageState({ path: STATE });
  await browser.close();
}
