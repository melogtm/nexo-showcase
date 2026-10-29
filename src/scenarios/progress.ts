import { asc, count, desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { loadCatalog } from "@/timeline/review";
import { buildTimeline } from "@/timeline/timeline";
import { earliest } from "./present";
import { latestBaseRuns } from "./store";

// Where each analysis stands in the flow review → client data → calculate, so lists can say what to do next.

export type Step = "REVISAR" | "DADOS" | "CALCULAR" | "RECALCULAR" | "PRONTO" | "SEM_LEITURA";
export type ProgressInput = {
  lido: boolean;
  atencao: number; // períodos PENDENTE or REVISAR
  sexo: boolean;
  nascimento: boolean;
  ultimoCalculoEm: Date | null;
  ultimaEdicaoEm: Date | null;
};
export type NextStep = { step: Step; label: string; tone: "ok" | "warn" | "danger" | "info" | "neutral" };

/** Pure. Review comes first because only OK períodos count; a calculation older than the last edit is stale. */
export function nextStep(p: ProgressInput): NextStep {
  if (!p.lido) return { step: "SEM_LEITURA", label: "Sem leitura do CNIS", tone: "neutral" };
  if (p.atencao > 0) return { step: "REVISAR", label: `Revisar ${p.atencao} ${p.atencao === 1 ? "vínculo" : "vínculos"}`, tone: "warn" };
  if (!p.nascimento) return { step: "DADOS", label: "Nascimento ausente no CNIS", tone: "danger" };
  if (!p.sexo) return { step: "DADOS", label: "Informar sexo do segurado", tone: "danger" };
  if (!p.ultimoCalculoEm) return { step: "CALCULAR", label: "Pronta para calcular", tone: "info" };
  if (p.ultimaEdicaoEm && p.ultimaEdicaoEm > p.ultimoCalculoEm) return { step: "RECALCULAR", label: "Recalcular: houve edição depois do cálculo", tone: "warn" };
  return { step: "PRONTO", label: "Cálculo em dia", tone: "ok" };
}

export type AnalysisOverview = Awaited<ReturnType<typeof analysesOverview>>[number];

/** Every analysis with its timeline numbers and next step, computed in memory from one query per table. */
export async function analysesOverview() {
  const db = await getDb();
  const a = schema.analysis;
  const [rows, edits, catalog, procs, base] = await Promise.all([
    db.select({ id: a.id, createdAt: a.createdAt, clientLabel: a.clientLabel, extraction: a.extraction }).from(a).orderBy(desc(a.createdAt)),
    db.select().from(schema.manualEdit).orderBy(asc(schema.manualEdit.id)),
    loadCatalog(),
    db.select({ analysisId: schema.processo.analysisId, n: count() }).from(schema.processo).groupBy(schema.processo.analysisId),
    latestBaseRuns(),
  ]);
  const procBy = new Map(procs.map((x) => [x.analysisId, x.n]));
  return rows.map((row) => {
    const own = edits.filter((e) => e.analysisId === row.id);
    const timeline = row.extraction ? buildTimeline(row.extraction, own, catalog) : null;
    const baseRun = base.get(row.id);
    const first = baseRun ? earliest(baseRun.result) : undefined;
    const atencao = timeline?.periodos.filter((p) => p.status === "PENDENTE" || p.status === "REVISAR").length ?? 0;
    const ultimaEdicaoEm = own.at(-1)?.editedAt ?? null;
    // Simulations are what-ifs: only ordinary runs say whether the client's calculation is up to date.
    const ultimoCalculoEm = baseRun?.createdAt ?? null;
    return {
      id: row.id,
      createdAt: row.createdAt,
      clientLabel: row.clientLabel,
      vinculos: timeline?.periodos.length ?? null,
      atencao,
      unparsed: row.extraction?.unparsed.length ?? null,
      tempoDias: timeline?.tempo.dias ?? null,
      carenciaMeses: timeline?.carencia.meses ?? null,
      ultimoCalculo: baseRun ? { id: baseRun.id, em: baseRun.createdAt } : null,
      processos: procBy.get(row.id) ?? 0,
      baseRun: baseRun ? { id: baseRun.id, referenceDate: baseRun.referenceDate, result: baseRun.result } : null,
      primeira: first?.dataProjetada ? { ruleName: first.nome, data: first.dataProjetada } : null,
      atualizadaEm: [row.createdAt, ultimaEdicaoEm, ultimoCalculoEm].filter((d): d is Date => d !== null).sort((x, y) => y.getTime() - x.getTime())[0],
      next: nextStep({
        lido: timeline !== null,
        atencao,
        sexo: !!timeline?.sexo,
        nascimento: !!row.extraction?.filiado.dataNascimento?.value,
        ultimoCalculoEm,
        ultimaEdicaoEm,
      }),
    };
  });
}
