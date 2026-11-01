import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // Each DB test file boots an in-memory PGlite and applies every migration; under parallel load that alone can pass 5s.
    testTimeout: 20_000,
    hookTimeout: 20_000, // beforeAll parses the PDFs; under coverage instrumentation that can pass the 10s default
    exclude: [...configDefaults.exclude, "e2e/**"], // Playwright specs, run by `npm run e2e`
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/app/**", "**/*.test.ts"], // src/app is gated by the E2E run (e2e/coverage.ts)
      reporter: ["text-summary", "lcovonly"],
      reportsDirectory: "coverage/unit",
      // Measured floor. Ratchet: raise it in the PR that adds tests; never lower it.
      thresholds: { statements: 89, branches: 73, functions: 88, lines: 92 },
    },
  },
});
