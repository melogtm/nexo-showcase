"use server";

import { redirect } from "next/navigation";
import { Temporal } from "temporal-polyfill";
import { ScenarioError, createRun, rerun } from "@/scenarios/store";

export type CalcState = { error?: string };

export async function calcular(analysisId: number, _prev: CalcState): Promise<CalcState> {
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

export async function reexecutar(runId: number, _prev: RerunState): Promise<RerunState> {
  try {
    return { identical: (await rerun(runId)).identical };
  } catch (e) {
    if (e instanceof ScenarioError) return { error: e.message };
    throw e;
  }
}
