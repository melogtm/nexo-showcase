import type { Movimento, ProcessoSnapshot } from "./types";

// The board's columns and the rules that place a lawsuit in one of them from its movements.
// Pure: no DB, no clock. Keywords are a reading of court vocabulary, not legal parameters. [VALIDAR] with the lawyers.

export const STAGES = [
  { id: "NOVO", label: "Novo", hint: "Distribuído, aguardando o primeiro andamento" },
  { id: "EM_ANDAMENTO", label: "Em andamento", hint: "Citação, perícia, prazos e juntadas" },
  { id: "EM_JULGAMENTO", label: "Em julgamento", hint: "Concluso, audiência ou sentença" },
  { id: "RECURSO", label: "Recurso", hint: "Turma recursal, TRF ou tribunal" },
  { id: "CONCLUIDO", label: "Concluído", hint: "Trânsito em julgado, baixa ou arquivo" },
] as const;

export type Stage = (typeof STAGES)[number]["id"];
export const STAGE_IDS = STAGES.map((s) => s.id) as [Stage, ...Stage[]];
export const isStage = (s: string): s is Stage => (STAGE_IDS as string[]).includes(s);
export const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)!.label;

/** Checked per movement, newest movement first; within one movement the first matching rule wins. */
const RULES: { stage: Stage; pattern: RegExp }[] = [
  { stage: "CONCLUIDO", pattern: /arquivamento definitivo|arquivad[oa]s? definitivamente|baixa definitiva|remetidos? ao arquivo|tr[âa]nsit(o|ad[oa]) em julgado|extin[çc][ãa]o da execu/i },
  { stage: "EM_ANDAMENTO", pattern: /cumprimento de senten|requisi[çc][ãa]o de pequeno valor|\brpv\b|precat[óo]rio|implanta[çc][ãa]o do benef/i },
  {
    stage: "RECURSO",
    pattern: /recurso inominado|apela[çc][ãa]o|agravo|embargos de declara|recurso especial|recurso extraordin|turma recursal|remetidos? (os autos )?(ao|à|a|para o?) ?(tribunal|trf|inst[âa]ncia superior)|ac[óo]rd[ãa]o/i,
  },
  { stage: "EM_JULGAMENTO", pattern: /conclus[oa]s? para (senten|julgamento|decis)|audi[êe]ncia|inclu[íi]d[oa] em pauta|senten[çc]a|julgad[oa] (procedente|improcedente|parcialmente)/i },
  { stage: "EM_ANDAMENTO", pattern: /cita[çc][ãa]o|citad[oa]|contesta|per[íi]cia|laudo|intima[çc]|despacho|juntada|prazo|manifesta|decis[ãa]o/i },
  { stage: "NOVO", pattern: /distribu[íi]d|autuad|peti[çc][ãa]o inicial/i },
];

export type Classificacao = { stage: Stage; motivo: string; movimento: Movimento | null };

const brDate = (iso: string) => iso.split("-").reverse().join("/");

/** The column a lawsuit belongs in, with the movement that decided it (shown on the card: nothing moves silently). */
export function classify(s: Pick<ProcessoSnapshot, "arquivado" | "extinto" | "movimentos">): Classificacao {
  if (s.arquivado || s.extinto) return { stage: "CONCLUIDO", motivo: s.extinto ? "Processo extinto na fonte." : "Processo arquivado na fonte.", movimento: s.movimentos[0] ?? null };
  for (const m of s.movimentos) {
    const text = `${m.titulo} ${m.descricao ?? ""}`;
    const rule = RULES.find((r) => r.pattern.test(text));
    if (rule) return { stage: rule.stage, motivo: `Movimentação de ${brDate(m.data)}: ${m.titulo}`, movimento: m };
  }
  return s.movimentos.length
    ? { stage: "EM_ANDAMENTO", motivo: `Movimentação de ${brDate(s.movimentos[0].data)} sem etapa reconhecida.`, movimento: s.movimentos[0] }
    : { stage: "NOVO", motivo: "Sem movimentações na fonte.", movimento: null };
}

export type StageState = { stage: Stage; origem: "AUTO" | "MANUAL"; alteradoEm: string /* ISO date, São Paulo */ };

/**
 * Should a sync move the card? Automatic placement always follows the court. A card the lawyer moved by hand stays
 * where it is until the court records something newer than that manual move (same day: the lawyer wins).
 */
export function decideStage(current: StageState, auto: Classificacao): { stage: Stage; origem: "AUTO" | "MANUAL"; changed: boolean } {
  const courtIsNewer = auto.movimento !== null && auto.movimento.data > current.alteradoEm;
  if (current.origem === "MANUAL" && !courtIsNewer) return { stage: current.stage, origem: "MANUAL", changed: false };
  return { stage: auto.stage, origem: "AUTO", changed: auto.stage !== current.stage };
}
