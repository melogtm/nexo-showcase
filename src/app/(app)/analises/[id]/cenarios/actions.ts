"use server";

import { requireSession } from "@/auth";
import { redirect } from "next/navigation";
import { Temporal } from "temporal-polyfill";
import { ScenarioError, createRun, rerun } from "@/scenarios/store";

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
