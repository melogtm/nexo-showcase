/** One court movement (andamento). Dates are ISO (YYYY-MM-DD). */
export type Movimento = { data: string; titulo: string; descricao: string | null };
export type Parte = { nome: string; polo: string | null };

/** A lawsuit as read from the data provider, normalised. Stored whole in `processo.snapshot` at each sync. */
export type ProcessoSnapshot = {
  numeroCnj: string;
  fonte: "JUSBRASIL" | "DEMO";
  classe: string | null;
  assunto: string | null;
  tribunal: string | null;
  orgao: string | null; // vara / juizado / turma
  comarca: string | null;
  uf: string | null;
  juiz: string | null;
  situacao: string | null;
  valorCausaCentavos: number | null;
  distribuidoEm: string | null;
  arquivado: boolean;
  extinto: boolean;
  partes: Parte[];
  /** Newest first. */
  movimentos: Movimento[];
  atualizadoNaFonteEm: string | null;
};

/** Where lawsuits come from. The real one calls the Jusbrasil API; the demo one fabricates synthetic data. */
export type ProcessoProvider = {
  fonte: ProcessoSnapshot["fonte"];
  fetch(numeroCnj: string): Promise<ProcessoSnapshot>;
};

export class ProcessoError extends Error {}
