"use server";

import { requireSession } from "@/auth";
import { redirect } from "next/navigation";
import { today } from "@/format";
import type { Premissas } from "@/scenarios/evaluate";
import { ScenarioError, createRun, rerun } from "@/scenarios/store";
import { isIsoDate } from "@/timeline/timeline";

export type CalcState = { error?: string };

/** Runs the rules and opens the result. The reference date is "today" in Brazil; everything after it is projection. */
async function runAndOpen(analysisId: number, premissas?: Premissas): Promise<CalcState> {
  let runId: number;
  try {
    runId = await createRun(analysisId, today(), premissas);
  } catch (e) {
    if (e instanceof ScenarioError) return { error: e.message };
    throw e;
  }
  redirect(`/analises/${analysisId}/cenarios/${runId}`);
}

export async function calcular(analysisId: number): Promise<CalcState> {
  await requireSession();
  return runAndOpen(analysisId);
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

/** Planning simulation: same calculation, with contributions stopping on a chosen date. Stored and re-runnable like any run. */
export async function simular(analysisId: number, _prev: CalcState, form: FormData): Promise<CalcState> {
  await requireSession();
  const contribuicaoAte = String(form.get("contribuicaoAte") ?? "");
  if (!isIsoDate(contribuicaoAte)) return { error: "Informe a data em que as contribuições param." };
  return runAndOpen(analysisId, { contribuicaoAte });
}
