import { brDate, brMonth } from "@/format";
import type { Periodo, Timeline } from "./timeline";

// Conferência: what to check before trusting the timeline, and which documents to ask the client for.
// Pure, derived from the same statuses the review screen shows: when the lawyer confirms or excludes a vínculo, its items disappear.
// [VALIDAR] The document lists are the project's reading of usual practice; confirm with the lawyers.

export type ChecklistItem = {
  id: string;
  /** Where it applies: "Vínculo 3 · EMPRESA X" or "Linha do tempo". */
  onde: string;
  /** Anchor on the analysis page (`#vinculo-3`), when the item belongs to a vínculo. */
  anchor: string | null;
  problema: string;
  documentos: string[];
  prioridade: "ALTA" | "MEDIA";
};

const code = (motivo: string) => /^([A-Z][A-Z0-9-]{1,10}):/.exec(motivo)?.[1] ?? null;

/** Documents that usually prove what an indicator questions. Unknown codes get the generic list. */
const DOCS_BY_INDICATOR: Record<string, string[]> = {
  PEXT: ["CTPS com o registro do contrato", "Contrato de trabalho ou ficha de registro de empregado", "Holerites ou extrato do FGTS do período"],
  "PREC-MENOR-MIN": ["Comprovantes de recolhimento (GPS/DARF) das competências", "Avaliar complementação das contribuições abaixo do mínimo"],
  "PREM-EXT": ["Holerites das competências indicadas", "Extrato do FGTS do período"],
};
const GENERIC_VINCULO_DOCS = ["CTPS", "Holerites ou extrato do FGTS do período"];

function itemsFor(p: Periodo): ChecklistItem[] {
  if (p.status === "EXCLUIDO" || p.confirmado) return [];
  const onde = `Vínculo ${p.seq ?? "?"} · ${p.origem ?? "—"}`;
  const anchor = `#${p.key.replace(":", "-")}`;
  const items: ChecklistItem[] = [];
  const add = (id: string, problema: string, documentos: string[], prioridade: ChecklistItem["prioridade"]) =>
    items.push({ id: `${p.key}:${id}`, onde, anchor, problema, documentos, prioridade });

  if (p.fimInferido) add("fim", `Sem data de saída no CNIS: o Nexo inferiu ${p.fim ? brDate(p.fim) : "?"} pela última competência.`, ["CTPS (página do contrato, com a data de saída)", "Termo de rescisão (TRCT)"], "ALTA");
  for (const m of p.motivos) {
    if (m.startsWith("Sem data fim")) continue; // covered above
    if (m.startsWith("Leitura:")) add(`leitura:${m}`, `${m.replace(/^Leitura:\s*/, "Leitura incerta: ")} (CNIS p. ${p.source.page}, l. ${p.source.line}).`, ["Conferir esta linha no PDF original do CNIS"], "ALTA");
    else if (m.startsWith("Indicador desconhecido")) add(`ind:${m}`, `${m}. O Nexo não conhece o efeito deste indicador.`, ["Consultar a legenda do CNIS", ...GENERIC_VINCULO_DOCS], "ALTA");
    else if (code(m)) add(`ind:${m}`, m, DOCS_BY_INDICATOR[code(m)!] ?? GENERIC_VINCULO_DOCS, "ALTA");
    else add(`m:${m}`, m, GENERIC_VINCULO_DOCS, "ALTA");
  }
  const comps = p.competencias.filter((c) => c.status !== "OK");
  if (comps.length) {
    const lista = comps.slice(0, 6).map((c) => brMonth(c.competencia)).join(", ") + (comps.length > 6 ? ` e mais ${comps.length - 6}` : "");
    const codes = [...new Set(comps.flatMap((c) => c.motivos.map(code)).filter((c): c is string => c !== null))];
    add("comps", `${comps.length} competência(s) com pendência: ${lista}.`, codes.flatMap((c) => DOCS_BY_INDICATOR[c] ?? []).concat(codes.length ? [] : ["Holerites ou comprovantes de recolhimento dessas competências"]), "MEDIA");
  }
  if (p.avisos.some((a) => /período especial/i.test(a))) add("especial", "Possível atividade especial (agente nocivo): hoje contada como tempo comum.", ["PPP (Perfil Profissiográfico Previdenciário)", "LTCAT da empresa"], "MEDIA");
  return items;
}

export function buildChecklist(timeline: Timeline, opts: { unparsed: number; nascimento: boolean }): ChecklistItem[] {
  const geral = (id: string, problema: string, documentos: string[], prioridade: ChecklistItem["prioridade"]): ChecklistItem => ({ id, onde: "Linha do tempo", anchor: null, problema, documentos, prioridade });
  const items = timeline.periodos.flatMap(itemsFor);
  for (const g of timeline.lacunas) {
    items.push(geral(`lacuna:${g.inicio}`, `Lacuna de ${g.dias} dias entre ${brDate(g.inicio)} e ${brDate(g.fim)}: nenhum vínculo no CNIS.`, ["Perguntar ao cliente se trabalhou ou contribuiu no período", "CTPS e carnês/GPS do período, se houver"], "MEDIA"));
  }
  if (opts.unparsed > 0) items.push({ ...geral("naolidos", `${opts.unparsed} trecho(s) do PDF não reconhecido(s) pelo Nexo.`, ["Conferir os trechos no PDF original"], "ALTA"), anchor: "#nao-lidos" });
  if (!timeline.sexo) items.push(geral("sexo", "Sexo do segurado não informado (o CNIS não traz de forma confiável).", ["Documento de identidade do cliente"], "ALTA"));
  if (!opts.nascimento) items.push(geral("nascimento", "Data de nascimento ausente no CNIS.", ["Documento de identidade do cliente"], "ALTA"));
  return items.sort((a, b) => (a.prioridade === b.prioridade ? 0 : a.prioridade === "ALTA" ? -1 : 1));
}

/** The documents to ask the client for, deduplicated, each with where it is needed. */
export function documentsToRequest(items: ChecklistItem[]): { documento: string; para: string[] }[] {
  const by = new Map<string, Set<string>>();
  for (const i of items) for (const d of i.documentos) {
    if (/^Conferir|^Consultar|^Avaliar|^Perguntar/.test(d)) continue; // office tasks, not documents
    if (!by.has(d)) by.set(d, new Set());
    by.get(d)!.add(i.onde);
  }
  return [...by].map(([documento, para]) => ({ documento, para: [...para] }));
}
