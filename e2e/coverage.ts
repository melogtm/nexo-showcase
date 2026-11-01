import { fileURLToPath } from "node:url";
import type { CoverageReportOptions } from "monocart-coverage-reports";
import ts from "typescript";

// Shared by the per-test fixture (browser coverage) and e2e/run.ts (server coverage + the report).
export const coverageOptions: CoverageReportOptions = {
  name: "Nexo E2E coverage (src/app)",
  outputDir: "coverage/e2e",
  reports: ["console-summary", "v8", "lcovonly", "json-summary"],
  // Only the app's own bundles (server chunks and browser chunks); their source maps lead back to src/.
  entryFilter: (entry) => entry.url.includes("/.next/server/") || entry.url.includes("/_next/static/"),
  // Turbopack writes "(app)" as "%28app%29" and roots paths at [project]/.
  sourcePath: (p) => decodeURIComponent(p).replace(/^.*?(src\/app\/)/, "$1"),
  // Real source files only: drops Next's client-reference proxies ("…/nav.tsx/__nextjs-internal-proxy.mjs …").
  outputFilter: (file) => /^src\/app\/.*\.tsx?$/.test(file.sourcePath),
  // Files no test loaded count as 0%, so a page that stops being visited lowers coverage instead of leaving the report.
  all: {
    dir: ["src/app"],
    filter: (p: string) => /\.tsx?$/.test(p) && !p.endsWith(".test.ts"),
    transformer: async (entry) => {
      const original = entry.source;
      const out = ts.transpileModule(original, {
        fileName: fileURLToPath(entry.url),
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, sourceMap: true },
      });
      entry.source = out.outputText.replace(/\/\/# sourceMappingURL=.*$/m, "");
      // TypeScript's map names only the basename and carries no content; point it at the real file.
      entry.sourceMap = { ...JSON.parse(out.sourceMapText!), sources: [fileURLToPath(entry.url)], sourcesContent: [original] };
    },
  },
};

// Gate on src/app coverage from the E2E run, set at the measured floor. Ratchet: raise it in the PR that adds tests; never lower it.
export const thresholds = { statements: 85, branches: 69, functions: 91, lines: 86 } as const;
