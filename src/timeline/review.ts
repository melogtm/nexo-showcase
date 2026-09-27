import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getAnalysis } from "@/ingestion/ingest";
import { buildTimeline, type IndicatorCatalog } from "./timeline";

export async function loadCatalog(): Promise<IndicatorCatalog> {
  const rows = await (await getDb()).select().from(schema.indicatorCatalog);
  return new Map(rows.map((r) => [r.code, { descricao: r.descricao, efeito: r.efeito }]));
}

export async function listEdits(analysisId: number) {
  const db = await getDb();
  return db.select().from(schema.manualEdit).where(eq(schema.manualEdit.analysisId, analysisId)).orderBy(asc(schema.manualEdit.id));
}

export type NewEdit = { target: string; field: string; oldValue: string | null; newValue: string; justificativa: string | null; editedBy: string };

export async function recordEdits(analysisId: number, edits: NewEdit[]) {
  if (edits.length === 0) return;
  await (await getDb()).insert(schema.manualEdit).values(edits.map((e) => ({ ...e, analysisId })));
}

/** Everything the review screen needs: the analysis, its edit log and the timeline rebuilt from both. */
export async function loadReview(analysisId: number) {
  const [analysis, edits, catalog] = await Promise.all([getAnalysis(analysisId), listEdits(analysisId), loadCatalog()]);
  if (!analysis?.extraction) return analysis ? { analysis, edits, timeline: null } : undefined;
  return { analysis, edits, timeline: buildTimeline(analysis.extraction, edits, catalog) };
}
