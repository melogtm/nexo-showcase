import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { canonicalJson } from "@/rules/core";
import { loadReview } from "@/timeline/review";
import { type RuleVersion, evaluate, missingInputs, scenarioInput } from "./evaluate";

export class ScenarioError extends Error {}

const toRuleVersion = (r: typeof schema.ruleVersion.$inferSelect): RuleVersion => ({
  id: r.id, ruleCode: r.ruleCode, version: r.version, nome: r.nome, legalBasis: r.legalBasis,
  logicVersion: r.logicVersion, parameters: r.parameters, contentHash: r.contentHash,
});

/** For a new run: the latest version of each rule in force on the reference date. */
export async function activeRuleVersions(referencia: string): Promise<RuleVersion[]> {
  const t = schema.ruleVersion;
  const rows = await (await getDb())
    .select()
    .from(t)
    .where(and(lte(t.validFrom, referencia), or(isNull(t.validTo), gt(t.validTo, referencia))))
    .orderBy(asc(t.ruleCode), desc(t.version));
  const latest = new Map<string, RuleVersion>();
  for (const r of rows) if (!latest.has(r.ruleCode)) latest.set(r.ruleCode, toRuleVersion(r));
  return [...latest.values()];
}

export async function createRun(analysisId: number, referencia: string): Promise<number> {
  const review = await loadReview(analysisId);
  if (!review?.timeline || !review.analysis.extraction) throw new ScenarioError("Análise sem linha do tempo.");
  const sexoEditIds = review.edits.filter((e) => e.target === "filiado" && e.field === "sexo").map((e) => e.id);
  const input = scenarioInput(review.analysis.extraction, review.timeline, sexoEditIds);
  const missing = missingInputs(input);
  if (missing.length) throw new ScenarioError(missing.join(" "));

  const versions = await activeRuleVersions(referencia);
  const { resultados, trail } = evaluate(input, versions, referencia);
  const [row] = await (await getDb())
    .insert(schema.calculationRun)
    .values({
      analysisId,
      pdfSha256: review.analysis.pdfSha256,
      referenceDate: referencia,
      timelineSnapshot: input,
      ruleVersions: versions.map(({ id, contentHash, logicVersion }) => ({ id, contentHash, logicVersion })),
      result: resultados,
      trail,
    })
    .returning({ id: schema.calculationRun.id });
  return row.id;
}

export async function getRun(runId: number) {
  const [run] = await (await getDb()).select().from(schema.calculationRun).where(eq(schema.calculationRun.id, runId));
  return run;
}

export async function listRuns(analysisId: number) {
  const r = schema.calculationRun;
  return (await getDb())
    .select({ id: r.id, referenceDate: r.referenceDate, createdAt: r.createdAt })
    .from(r)
    .where(eq(r.analysisId, analysisId))
    .orderBy(desc(r.id));
}

/**
 * Re-executes a stored run from its own inputs and rule versions (by stored id, never "the version in force today")
 * and compares with what was stored. A parameter/hash mismatch is an error, never a silent recompute.
 */
export async function rerun(runId: number) {
  const run = await getRun(runId);
  if (!run) throw new ScenarioError("Cálculo não encontrado.");
  const ids = run.ruleVersions.map((v) => v.id);
  const rows = await (await getDb()).select().from(schema.ruleVersion).where(inArray(schema.ruleVersion.id, ids));
  const byId = new Map(rows.map((r) => [r.id, toRuleVersion(r)]));
  const versions = run.ruleVersions.map((stored) => {
    const v = byId.get(stored.id);
    if (!v) throw new ScenarioError(`rule_version ${stored.id} não existe mais.`);
    if (v.contentHash !== stored.contentHash || v.logicVersion !== stored.logicVersion) {
      throw new ScenarioError(`rule_version ${stored.id} mudou desde o cálculo (hash ou lógica diferente).`);
    }
    return v;
  });
  const again = evaluate(run.timelineSnapshot, versions, run.referenceDate);
  return {
    identical: canonicalJson(again.resultados) === canonicalJson(run.result) && canonicalJson(again.trail) === canonicalJson(run.trail),
    resultados: again.resultados,
  };
}
