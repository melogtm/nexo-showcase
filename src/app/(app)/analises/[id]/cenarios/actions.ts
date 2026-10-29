"use server";

import { requireSession } from "@/auth";
import { redirect } from "next/navigation";
import { Temporal } from "temporal-polyfill";
import { ScenarioError, createRun, rerun } from "@/scenarios/store";
import { isIsoDate } from "@/timeline/timeline";

export type CalcState = { error?: string };

export async function calcular(analysisId: number): Promise<CalcState> {
  await requireSession();
  let runId: number;
  try {
    // The reference date is "today" in Brazil; everything after it is projection.
    runId = await createRun(analysisId, Temporal.Now.plainDateISO("America/Sao_Paulo").toString());
  } catch (e) {
    if (e instanceof ScenarioError) return { error: e.message };
    throw e;
  }
  redirect(`/analises/${analysisId}/cenarios/${runId}`);
}

export type RerunState = { identical?: boolean; error?: string };

export async function reexecutar(runId: number): Promise<RerunState> {
  await requireSession();
  try {
    return { identical: (await rerun(runId)).identical };
  } catch (e) {
    if (e instanceof ScenarioError) return { error: e.message };
    throw e;
  }
}

export type SimState = { error?: string };

/** Planning simulation: same calculation, with contributions stopping on a chosen date. Stored and re-runnable like any run. */
export async function simular(analysisId: number, _prev: SimState, form: FormData): Promise<SimState> {
  await requireSession();
  const contribuicaoAte = String(form.get("contribuicaoAte") ?? "");
  if (!isIsoDate(contribuicaoAte)) return { error: "Informe a data em que as contribuições param." };
  let runId: number;
  try {
    runId = await createRun(analysisId, Temporal.Now.plainDateISO("America/Sao_Paulo").toString(), { contribuicaoAte });
  } catch (e) {
    if (e instanceof ScenarioError) return { error: e.message };
    throw e;
  }
  redirect(`/analises/${analysisId}/cenarios/${runId}`);
}
