import { defineConfig, devices } from "@playwright/test";
import { STATE } from "./e2e/global-setup";

const port = Number(process.env.E2E_PORT ?? 3100);

// One shared, fresh database per run (see e2e/run.ts), so specs run serially and create their own data.
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${port}`, storageState: STATE, trace: "retain-on-failure", locale: "pt-BR", timezoneId: "America/Sao_Paulo" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // `npm run e2e` starts the server itself (with server coverage); this only covers a bare `npx playwright test`.
  webServer: {
    command: `npx next start -p ${port}`,
    url: `http://localhost:${port}/login`,
    reuseExistingServer: true,
    // Same isolation as e2e/run.ts: never the DATABASE_URL or the Jusbrasil token from .env.local.
    env: { NEXO_PASSWORD: process.env.NEXO_PASSWORD ?? "e2e", PGLITE_DIR: process.env.PGLITE_DIR ?? ".pglite-e2e", DATABASE_URL: process.env.E2E_DATABASE_URL ?? "", JUSBRASIL_API_TOKEN: "", CRON_SECRET: "" },
  },
});
