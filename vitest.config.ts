import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Each DB test file boots an in-memory PGlite and applies every migration; under parallel load that alone can pass 5s.
  test: { testTimeout: 20_000 },
});
