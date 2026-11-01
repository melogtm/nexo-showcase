import { today } from "@/format";
import { demoProvider } from "./demo";
import { jusbrasilProvider } from "./jusbrasil";
import type { ProcessoProvider } from "./types";

/** The real Jusbrasil API when JUSBRASIL_API_TOKEN is set; synthetic demo lawsuits otherwise. */
export function getProvider(): ProcessoProvider {
  const token = process.env.JUSBRASIL_API_TOKEN;
  return token ? jusbrasilProvider(token) : demoProvider(today);
}
