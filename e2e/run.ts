// npm run e2e [-- <playwright args>]
// Starts the built app (`next build` first; NEXO_COVERAGE=1 adds browser source maps) with the Node inspector on localhost,
// records the server's JS coverage over CDP while Playwright runs (the fixture records the browser's), then merges both,
// maps them to src/app through the source maps and enforces the gate in e2e/coverage.ts.
// Database: E2E_DATABASE_URL when set (CI: Postgres container, nightly: Neon branch); otherwise a fresh PGlite in .pglite-e2e.
// Never DATABASE_URL: one pulled into .env.local by `vercel env pull` points at prod, and next start would load it.
import { type ChildProcess, spawn } from "node:child_process";
import { rmSync } from "node:fs";
import MCR, { CDPClient } from "monocart-coverage-reports";
import { coverageOptions, thresholds } from "./coverage";

const port = process.env.E2E_PORT ?? "3100";
const inspectPort = Number(process.env.E2E_INSPECT_PORT ?? 9230);
// Empty strings, not deletes: Next only fills a variable from .env files when it is absent.
const env = {
  ...process.env,
  E2E_PORT: port,
  NEXO_PASSWORD: process.env.NEXO_PASSWORD ?? "e2e",
  PGLITE_DIR: process.env.PGLITE_DIR ?? ".pglite-e2e",
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
  JUSBRASIL_API_TOKEN: "", // demo provider: "Sincronizar" must never call the paid API
  CRON_SECRET: "",
};

rmSync("coverage/e2e", { recursive: true, force: true });
if (!env.DATABASE_URL) rmSync(env.PGLITE_DIR, { recursive: true, force: true }); // fresh local database per run

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port], {
  env: { ...env, NODE_OPTIONS: `--inspect=127.0.0.1:${inspectPort}` },
  stdio: ["ignore", "inherit", "inherit"],
});
const exited = (p: ChildProcess) => new Promise<number>((resolve) => p.once("exit", (code) => resolve(code ?? 1)));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error("next start exited before it was ready (did you run `npm run build`?)");
    const ok = await fetch(`http://localhost:${port}/login`).then((r) => r.ok, () => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("next start did not answer on /login within 60s");
}

const mcr = MCR(coverageOptions);
let code = 1;
try {
  await waitForServer();
  const cdp = await CDPClient({ port: inspectPort });
  if (!cdp) throw new Error(`could not attach to the server's inspector on port ${inspectPort}`);
  await cdp.startJSCoverage();
  code = await exited(spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], { env, stdio: "inherit" }));
  await mcr.add(await cdp.stopJSCoverage());
  await cdp.close();
} finally {
  server.kill("SIGINT");
  const stopped = await Promise.race([exited(server), new Promise((r) => setTimeout(r, 15_000, "timeout"))]);
  if (stopped === "timeout") server.kill("SIGKILL");
}

const summary = (await mcr.generate())?.summary;
const pct = (k: keyof typeof thresholds) => Number(summary?.[k].pct ?? 0);
const below = (Object.keys(thresholds) as (keyof typeof thresholds)[]).filter((k) => pct(k) < thresholds[k]);
for (const k of below) console.error(`coverage gate: ${k} ${pct(k)}% < ${thresholds[k]}% (e2e/coverage.ts)`);
process.exit(code || (below.length ? 1 : 0));
