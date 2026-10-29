import { Temporal } from "temporal-polyfill";
import { demoProvider } from "./demo";
import { jusbrasilProvider } from "./jusbrasil";
import type { ProcessoProvider } from "./types";

export const today = () => Temporal.Now.plainDateISO("America/Sao_Paulo").toString();

/** The real Jusbrasil API when JUSBRASIL_API_TOKEN is set; synthetic demo lawsuits otherwise. */
export function getProvider(): ProcessoProvider {
  const token = process.env.JUSBRASIL_API_TOKEN;
  return token ? jusbrasilProvider(token) : demoProvider(today);
}
