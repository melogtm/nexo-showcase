import { readFileSync } from "node:fs";
import { beforeAll, expect, test } from "vitest";
import { type CnisExtraction, parseCnis } from "@/cnis/parse";
import { buildTimeline, type IndicatorCatalog } from "@/timeline/timeline";
import { loadCatalog } from "@/timeline/review";
import { type AnswerKey, evaluateH1 } from "./h1";

let extraction: CnisExtraction;
let catalog: IndicatorCatalog;
const key = JSON.parse(readFileSync("fixtures/h1/cnis-exemplo-sintetico.json", "utf8")) as AnswerKey;

beforeAll(async () => {
  [extraction, catalog] = await Promise.all([parseCnis(new Uint8Array(readFileSync("public/cnis-exemplo-sintetico.pdf"))), loadCatalog()]);
});

const run = (tamper: (e: CnisExtraction) => void) => {
  const e = structuredClone(extraction);
  tamper(e);
  return evaluateH1(e, buildTimeline(e, [], catalog), key);
};

test("the public sample matches its hand-annotated answer key", () => {
  const r = run(() => {});
  expect(r.errors).toEqual([]);
  expect(r.vinculos).toEqual({ esperados: 5, extraidos: 5, corretos: 5 });
  expect(r.competencias).toEqual({ esperados: 114, extraidos: 114, corretos: 114 });
});

test("a misread value is a silent error unless the parser flagged it", () => {
  const misread = (e: CnisExtraction) => (e.vinculos[0].remuneracoes[0].valorCentavos.value = 9_000);
  expect(run(misread).errors).toEqual([{ item: "vínculo 1 01/2005", kind: "divergente", flagged: false, detail: "valor 9000 ≠ 90000 centavos" }]);
  const flagged = run((e) => {
    misread(e);
    e.vinculos[0].remuneracoes[0].problems.push("Remuneração ilegível");
  });
  expect(flagged.errors.map((x) => x.flagged)).toEqual([true]);
  expect(flagged.competencias.corretos).toBe(113);
});

test("an unreadable seq is one flagged error, not a missing plus a spurious vínculo", () => {
  const r = run((e) => {
    e.vinculos[0].seq.value = null;
    e.vinculos[0].problems.push("Seq. ilegível");
  });
  expect(r.errors).toEqual([{ item: "vínculo 1", kind: "divergente", flagged: true, detail: "seq: — ≠ 1" }]);
});

test("a dropped vínculo is silent unless its text reached the unparsed excerpts", () => {
  const drop = (e: CnisExtraction) => e.vinculos.splice(3, 1); // the benefit, seq 4
  expect(run(drop).errors).toEqual([{ item: "vínculo 4", kind: "ausente", flagged: false, detail: "não extraído" }]);
  const shown = run((e) => {
    drop(e);
    e.unparsed.push({ page: 2, line: 20, rawText: "4 123.45678.90-1 1234567890 Benefício 10/05/2016 06/09/2016" });
  });
  expect(shown.errors.map((x) => x.flagged)).toEqual([true]);
  expect(shown.vinculos).toEqual({ esperados: 5, extraidos: 4, corretos: 4 });
});
