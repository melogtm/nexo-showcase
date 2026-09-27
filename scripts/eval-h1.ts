// npm run eval:h1 [-- <cnis.pdf> <gabarito.json> ...]
// No arguments: the public synthetic sample. Answer keys for real extracts stay in fixtures/real/ (gitignored).
// Exits 1 when any error is silent, so it can gate a parser change.
import { readFileSync } from "node:fs";
import { parseCnis } from "@/cnis/parse";
import { type AnswerKey, evaluateH1, formatH1 } from "@/eval/h1";
import { buildTimeline } from "@/timeline/timeline";
import { loadCatalog } from "@/timeline/review";

const args = process.argv.slice(2);
const pairs = args.length ? args : ["public/cnis-exemplo-sintetico.pdf", "fixtures/h1/cnis-exemplo-sintetico.json"];
if (pairs.length % 2) throw new Error("Uso: npm run eval:h1 -- <cnis.pdf> <gabarito.json> [...]");

const catalog = await loadCatalog();
let silent = 0;
for (let i = 0; i < pairs.length; i += 2) {
  const extraction = await parseCnis(new Uint8Array(readFileSync(pairs[i])));
  const key = JSON.parse(readFileSync(pairs[i + 1], "utf8")) as AnswerKey;
  const report = evaluateH1(extraction, buildTimeline(extraction, [], catalog), key);
  silent += report.errors.filter((e) => !e.flagged).length;
  console.log(`${formatH1(`${pairs[i]} (parser v${extraction.parserVersion})`, report)}\n`);
}
process.exit(silent ? 1 : 0);
