import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { parseCnj } from "./cnj";
import { getProvider } from "./provider";
import { type Stage, classify, decideStage, stageLabel } from "./stages";
import { ProcessoError, type ProcessoProvider, type ProcessoSnapshot } from "./types";

// The board's persistence. Everything that decides a column lives in ./stages (pure); this file only reads and writes.

export type Processo = typeof schema.processo.$inferSelect;
export type ProcessoEvento = typeof schema.processoEvento.$inferSelect;

const p = schema.processo;
const ev = schema.processoEvento;

/** São Paulo calendar date of an audit timestamp, to compare with court movement dates. */
const spDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

export type ImportInput = { numero: string; clientLabel?: string | null; analysisId?: number | null };

export async function importProcesso(input: ImportInput, provider: ProcessoProvider = getProvider()): Promise<number> {
  const numeroCnj = parseCnj(input.numero);
  if (!numeroCnj) throw new ProcessoError("Número CNJ inválido. Confira os 20 dígitos (NNNNNNN-DD.AAAA.J.TR.OOOO).");
  const db = await getDb();
  const [existing] = await db.select({ id: p.id }).from(p).where(eq(p.numeroCnj, numeroCnj));
  if (existing) throw new ProcessoError("Este processo já está no quadro.");

  const snapshot = await provider.fetch(numeroCnj);
  const auto = classify(snapshot);
  const clientLabel = input.clientLabel?.trim().slice(0, 200) || null;
  const [row] = await db
    .insert(p)
    .values({
      numeroCnj,
      clientLabel,
      analysisId: input.analysisId ?? null,
      fonte: snapshot.fonte,
      stage: auto.stage,
      stageOrigem: "AUTO",
      stageMotivo: auto.motivo,
      ultimaMovimentacaoEm: snapshot.movimentos[0]?.data ?? null,
      snapshot,
    })
    .returning({ id: p.id });
  await db.insert(ev).values({ processoId: row.id, tipo: "IMPORTADO", para: auto.stage, origem: "AUTO", motivo: auto.motivo, novasMovimentacoes: snapshot.movimentos.length });
  return row.id;
}

export type SyncResult = { id: number; changed: boolean; novas: number; stage: Stage };

/** Re-reads one lawsuit from the provider and moves its card if the court says so (see decideStage). */
export async function syncProcesso(id: number, provider: ProcessoProvider = getProvider()): Promise<SyncResult> {
  const db = await getDb();
  const [current] = await db.select().from(p).where(eq(p.id, id));
  if (!current) throw new ProcessoError("Processo não encontrado.");
  const snapshot = await provider.fetch(current.numeroCnj);
  return applySnapshot(current, snapshot);
}

async function applySnapshot(current: Processo, snapshot: ProcessoSnapshot): Promise<SyncResult> {
  const db = await getDb();
  const auto = classify(snapshot);
  const decision = decideStage({ stage: current.stage, origem: current.stageOrigem, alteradoEm: spDate(current.stageAlteradoEm) }, auto);
  const known = new Set(current.snapshot.movimentos.map((m) => `${m.data}|${m.titulo}`));
  const novas = snapshot.movimentos.filter((m) => !known.has(`${m.data}|${m.titulo}`)).length;
  const now = new Date();

  await db
    .update(p)
    .set({
      snapshot,
      fonte: snapshot.fonte,
      sincronizadoEm: now,
      ultimaMovimentacaoEm: snapshot.movimentos[0]?.data ?? null,
      ...(decision.changed || decision.origem !== current.stageOrigem
        ? { stage: decision.stage, stageOrigem: decision.origem, stageMotivo: auto.motivo, stageAlteradoEm: now }
        : decision.origem === "AUTO"
          ? { stageMotivo: auto.motivo }
          : {}),
    })
    .where(eq(p.id, current.id));

  if (decision.changed) {
    await db.insert(ev).values({ processoId: current.id, tipo: "ETAPA", de: current.stage, para: decision.stage, origem: "AUTO", motivo: auto.motivo, novasMovimentacoes: novas });
  } else if (novas > 0) {
    await db.insert(ev).values({ processoId: current.id, tipo: "SINCRONIZADO", origem: "AUTO", motivo: `${novas} nova(s) movimentação(ões).`, novasMovimentacoes: novas });
  }
  return { id: current.id, changed: decision.changed, novas, stage: decision.stage };
}

export type SyncAllResult = { total: number; mudaram: number; novas: number; erros: { numeroCnj: string; erro: string }[] };

export async function syncAll(provider: ProcessoProvider = getProvider()): Promise<SyncAllResult> {
  const db = await getDb();
  const all = await db.select().from(p).orderBy(asc(p.id));
  const out: SyncAllResult = { total: all.length, mudaram: 0, novas: 0, erros: [] };
  for (const current of all) {
    try {
      const r = await applySnapshot(current, await provider.fetch(current.numeroCnj));
      if (r.changed) out.mudaram++;
      out.novas += r.novas;
    } catch (e) {
      if (!(e instanceof ProcessoError)) throw e;
      out.erros.push({ numeroCnj: current.numeroCnj, erro: e.message });
    }
  }
  return out;
}

/** The lawyer moves a card. Recorded as MANUAL, so a sync keeps it there until the court records something newer. */
export async function moveProcesso(id: number, stage: Stage, editedBy: string, motivo?: string | null) {
  const db = await getDb();
  const [current] = await db.select({ stage: p.stage }).from(p).where(eq(p.id, id));
  if (!current) throw new ProcessoError("Processo não encontrado.");
  if (current.stage === stage) return;
  const texto = motivo?.trim().slice(0, 500) || `Movido manualmente para ${stageLabel(stage)}.`;
  await db.update(p).set({ stage, stageOrigem: "MANUAL", stageMotivo: texto, stageAlteradoEm: new Date() }).where(eq(p.id, id));
  await db.insert(ev).values({ processoId: id, tipo: "ETAPA", de: current.stage, para: stage, origem: "MANUAL", motivo: texto, editedBy });
}

/** Hand the card back to the movements: it goes wherever the court data places it. */
export async function resumeAuto(id: number) {
  const db = await getDb();
  const [current] = await db.select().from(p).where(eq(p.id, id));
  if (!current) throw new ProcessoError("Processo não encontrado.");
  const auto = classify(current.snapshot);
  await db.update(p).set({ stage: auto.stage, stageOrigem: "AUTO", stageMotivo: auto.motivo, stageAlteradoEm: new Date() }).where(eq(p.id, id));
  if (auto.stage !== current.stage) await db.insert(ev).values({ processoId: id, tipo: "ETAPA", de: current.stage, para: auto.stage, origem: "AUTO", motivo: auto.motivo });
}

export async function linkAnalysis(id: number, analysisId: number | null, clientLabel: string | null) {
  await (await getDb()).update(p).set({ analysisId, clientLabel: clientLabel?.trim().slice(0, 200) || null }).where(eq(p.id, id));
}

export async function listProcessos() {
  return (await getDb()).select().from(p).orderBy(sql`${p.ultimaMovimentacaoEm} desc nulls last`, desc(p.id));
}

export async function getProcesso(id: number) {
  if (!Number.isSafeInteger(id)) return undefined;
  const [row] = await (await getDb()).select().from(p).where(eq(p.id, id));
  return row;
}

export async function listEventos(id: number) {
  return (await getDb()).select().from(ev).where(eq(ev.processoId, id)).orderBy(desc(ev.id));
}

export async function processosOfAnalysis(analysisId: number) {
  return (await getDb()).select().from(p).where(eq(p.analysisId, analysisId)).orderBy(desc(p.id));
}

/** The newest movements across the board, for the dashboard feed. */
export async function recentMovimentos(limit: number) {
  const rows = await listProcessos();
  return rows
    .flatMap((r) => r.snapshot.movimentos.slice(0, 3).map((m) => ({ processoId: r.id, numeroCnj: r.numeroCnj, clientLabel: r.clientLabel, ...m })))
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, limit);
}
