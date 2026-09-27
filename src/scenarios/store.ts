import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { canonicalJson } from "@/rules/core";
import type { RmiInput } from "@/rules/ec103-art26.v1";
import { getAnalysis } from "@/ingestion/ingest";
import { loadReview } from "@/timeline/review";
import { type RuleVersion, evaluate, missingInputs, scenarioInput } from "./evaluate";

export class ScenarioError extends Error {}

/** For a new run: the latest version of each rule in force on the reference date. */
export async function activeRuleVersions(referencia: string): Promise<RuleVersion[]> {
  const t = schema.ruleVersion;
  const rows = await (await getDb())
    .select()
    .from(t)
    .where(and(lte(t.validFrom, referencia), or(isNull(t.validTo), gt(t.validTo, referencia))))
    .orderBy(asc(t.ruleCode), desc(t.version));
  const latest = new Map<string, RuleVersion>();
  for (const r of rows) if (!latest.has(r.ruleCode)) latest.set(r.ruleCode, r);
  return [...latest.values()];
}

export async function createRun(analysisId: number, referencia: string): Promise<number> {
  const review = await loadReview(analysisId);
  if (!review?.timeline || !review.analysis.extraction) throw new ScenarioError("Análise sem linha do tempo.");
  const sexoEditIds = review.edits.filter((e) => e.target === "filiado" && e.field === "sexo").map((e) => e.id);
  const base = scenarioInput(review.analysis.extraction, review.timeline, sexoEditIds);
  const input = { ...base, ...(await inpcFor(base.salarios ?? [], referencia)) };
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

/**
 * The INPC numbers a run needs, frozen into its snapshot: the latest index published before the reference month
 * (what the salários are corrected to) and the index of every salário's competência.
 */
async function inpcFor(salarios: RmiInput["salarios"], referencia: string): Promise<Pick<RmiInput, "inpc" | "correcaoAte">> {
  const t = schema.inpcIndice;
  const db = await getDb();
  const [latest] = await db.select({ competencia: t.competencia }).from(t).where(lt(t.competencia, referencia.slice(0, 7))).orderBy(desc(t.competencia)).limit(1);
  const months = [...new Set([...salarios.map((s) => s.competencia), ...(latest ? [latest.competencia] : [])])];
  const rows = months.length ? await db.select().from(t).where(inArray(t.competencia, months)) : [];
  return { inpc: Object.fromEntries(rows.map((r) => [r.competencia, r.indice])), correcaoAte: latest?.competencia ?? null };
}

/** Rule versions by id (a run's own versions, never "the version in force today"). */
export async function ruleVersionsByIds(ids: number[]): Promise<Map<number, RuleVersion>> {
  const rows = ids.length ? await (await getDb()).select().from(schema.ruleVersion).where(inArray(schema.ruleVersion.id, ids)) : [];
  return new Map(rows.map((r) => [r.id, r]));
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

/** A run with its analysis and its own rule versions, checked to belong together. */
export async function loadRunView(analysisId: number, runId: number) {
  const run = Number.isSafeInteger(runId) ? await getRun(runId) : undefined;
  if (!run || run.analysisId !== analysisId) return undefined;
  const [analysis, versions] = await Promise.all([getAnalysis(analysisId), ruleVersionsByIds(run.ruleVersions.map((v) => v.id))]);
  return analysis ? { run, analysis, versions } : undefined;
}

/**
 * Re-executes a stored run from its own inputs and rule versions (by stored id, never "the version in force today")
 * and compares with what was stored. A parameter/hash mismatch is an error, never a silent recompute.
 */
export async function rerun(runId: number) {
  const run = await getRun(runId);
  if (!run) throw new ScenarioError("Cálculo não encontrado.");
  const byId = await ruleVersionsByIds(run.ruleVersions.map((v) => v.id));
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
