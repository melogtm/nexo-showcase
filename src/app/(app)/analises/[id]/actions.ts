"use server";

import { revalidatePath } from "next/cache";
import { credentials, requireSession } from "@/auth";
import { type NewEdit, loadReview, recordEdits } from "@/timeline/review";
import { isIsoDate } from "@/timeline/timeline";

export type EditState = { error?: string; saved?: boolean };

const INTENTS = ["salvar", "confirmar", "excluir", "reabrir"] as const;

export async function saveVinculo(analysisId: number, key: string, _prev: EditState, form: FormData): Promise<EditState> {
  await requireSession();
  const review = await loadReview(analysisId);
  const periodo = review?.timeline?.periodos.find((p) => p.key === key);
  if (!review?.timeline || !periodo) return { error: "Vínculo não encontrado." };

  const intent = String(form.get("intent"));
  if (!INTENTS.includes(intent as (typeof INTENTS)[number])) return { error: "Ação inválida." };
  const justificativa = String(form.get("justificativa") ?? "").trim().slice(0, 500) || null;
  const inicio = String(form.get("inicio") ?? "");
  const fim = String(form.get("fim") ?? "");
  if ((inicio && !isIsoDate(inicio)) || (fim && !isIsoDate(fim))) return { error: "Data inválida." };
  const newInicio = inicio || periodo.inicio;
  const newFim = fim || periodo.fim;
  if (intent === "confirmar" && (!newInicio || !newFim || newInicio > newFim)) {
    return { error: "Informe início e fim válidos antes de confirmar." };
  }

  const editedBy = credentials()?.user ?? "desconhecido";
  const edits: NewEdit[] = [];
  const change = (field: string, oldValue: string | null, newValue: string) => {
    if (newValue !== (oldValue ?? "")) edits.push({ target: key, field, oldValue, newValue, justificativa, editedBy });
  };
  if (intent === "salvar" || intent === "confirmar") {
    if (inicio) change("dataInicio", periodo.inicio, inicio);
    // An inferred end date was never in the CNIS: record the change even if the lawyer keeps the same day.
    if (fim) change("dataFim", periodo.fimInferido ? null : periodo.fim, fim);
  }
  const decisaoAtual = periodo.status === "EXCLUIDO" ? "EXCLUIR" : periodo.confirmado ? "CONFIRMAR" : "";
  if (intent === "confirmar") change("decisao", decisaoAtual, "CONFIRMAR");
  if (intent === "excluir") change("decisao", decisaoAtual, "EXCLUIR");
  if (intent === "reabrir") change("decisao", decisaoAtual, "");

  if (edits.length === 0) return { error: "Nada mudou." };
  await recordEdits(analysisId, edits);
  revalidatePath(`/analises/${analysisId}`);
  return { saved: true };
}

export async function saveSexo(analysisId: number, form: FormData) {
  await requireSession();
  const sexo = String(form.get("sexo"));
  const review = await loadReview(analysisId);
  if (!review?.timeline || (sexo !== "F" && sexo !== "M") || sexo === review.timeline.sexo) return;
  await recordEdits(analysisId, [
    { target: "filiado", field: "sexo", oldValue: review.timeline.sexo, newValue: sexo, justificativa: null, editedBy: credentials()?.user ?? "desconhecido" },
  ]);
  revalidatePath(`/analises/${analysisId}`);
}
