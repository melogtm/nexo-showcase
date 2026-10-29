"use server";

import { revalidatePath } from "next/cache";
import { credentials, requireSession } from "@/auth";
import { demoNumbers } from "@/processos/demo";
import { getProvider } from "@/processos/provider";
import { isStage } from "@/processos/stages";
import { importProcesso, linkAnalysis, moveProcesso, resumeAuto, syncAll, syncProcesso } from "@/processos/store";
import { ProcessoError } from "@/processos/types";

const refresh = (id?: number) => {
  revalidatePath("/processos");
  revalidatePath("/");
  if (id) revalidatePath(`/processos/${id}`);
};
const parseAnalysisId = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return v && Number.isSafeInteger(n) && n > 0 ? n : null;
};

export type ImportState = { error?: string; importedId?: number; numero?: string };

export async function importar(_prev: ImportState, form: FormData): Promise<ImportState> {
  await requireSession();
  const numero = String(form.get("numero") ?? "");
  try {
    const id = await importProcesso({ numero, clientLabel: String(form.get("clientLabel") ?? ""), analysisId: parseAnalysisId(form.get("analysisId")) });
    refresh();
    return { importedId: id };
  } catch (e) {
    if (e instanceof ProcessoError) return { error: e.message, numero };
    throw e;
  }
}

/** Demo mode only: fills an empty board with synthetic lawsuits to try the flow. */
export async function carregarExemplos() {
  await requireSession();
  if (getProvider().fonte !== "DEMO") return;
  for (const [i, numero] of demoNumbers(8).entries()) {
    try {
      await importProcesso({ numero, clientLabel: `Cliente exemplo ${String(i + 1).padStart(2, "0")}` });
    } catch (e) {
      if (!(e instanceof ProcessoError)) throw e; // already on the board: skip
    }
  }
  refresh();
}

export type SyncState = { message?: string; error?: string };

export async function sincronizarTodos(): Promise<SyncState> {
  await requireSession();
  const r = await syncAll();
  refresh();
  const partes = [`${r.total} processo(s) consultado(s)`, `${r.novas} movimentação(ões) nova(s)`, `${r.mudaram} mudaram de coluna`];
  return r.erros.length ? { message: partes.join(" · "), error: `${r.erros.length} com erro: ${r.erros[0].erro}` } : { message: partes.join(" · ") };
}

export async function sincronizar(id: number): Promise<SyncState> {
  await requireSession();
  try {
    const r = await syncProcesso(id);
    refresh(id);
    return { message: r.novas ? `${r.novas} movimentação(ões) nova(s)${r.changed ? " · coluna atualizada" : ""}.` : "Sem novidades na fonte." };
  } catch (e) {
    if (e instanceof ProcessoError) return { error: e.message };
    throw e;
  }
}

export async function mover(id: number, stage: string, motivo?: string) {
  await requireSession();
  if (!isStage(stage)) return;
  await moveProcesso(id, stage, credentials()?.user ?? "desconhecido", motivo);
  refresh(id);
}

export async function moverComMotivo(id: number, form: FormData) {
  await mover(id, String(form.get("stage")), String(form.get("motivo") ?? ""));
}

export async function retomarAutomatico(id: number) {
  await requireSession();
  await resumeAuto(id);
  refresh(id);
}

export async function vincular(id: number, form: FormData) {
  await requireSession();
  await linkAnalysis(id, parseAnalysisId(form.get("analysisId")), String(form.get("clientLabel") ?? ""));
  refresh(id);
}
