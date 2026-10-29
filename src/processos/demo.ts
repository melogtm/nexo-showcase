import { Temporal } from "temporal-polyfill";
import { buildCnj, courtOf } from "./cnj";
import type { Movimento, ProcessoProvider, ProcessoSnapshot } from "./types";

// Synthetic lawsuits for when no Jusbrasil token is configured (dev, tests, the public demo).
// Deterministic per CNJ number; movements up to "today" are revealed, so a later sync shows progress.

const SCRIPT: { dia: number; titulo: string; descricao: string }[] = [
  { dia: 0, titulo: "Distribuído por sorteio", descricao: "Processo distribuído ao Juizado Especial Federal." },
  { dia: 4, titulo: "Despacho", descricao: "Cite-se o INSS. Designe-se perícia médica." },
  { dia: 11, titulo: "Expedição de citação", descricao: "Citação eletrônica do INSS expedida." },
  { dia: 46, titulo: "Perícia designada", descricao: "Perícia médica designada para o fórum federal." },
  { dia: 83, titulo: "Juntada de laudo pericial", descricao: "Laudo pericial juntado aos autos." },
  { dia: 101, titulo: "Contestação", descricao: "Contestação apresentada pelo INSS." },
  { dia: 128, titulo: "Conclusos para sentença", descricao: "Autos conclusos para julgamento." },
  { dia: 159, titulo: "Sentença", descricao: "Julgado procedente o pedido. Intimem-se." },
  { dia: 178, titulo: "Recurso inominado", descricao: "Recurso inominado interposto pelo INSS." },
  { dia: 196, titulo: "Remetidos os autos à Turma Recursal", descricao: "Autos remetidos para julgamento do recurso." },
  { dia: 311, titulo: "Acórdão", descricao: "Negado provimento ao recurso do INSS." },
  { dia: 342, titulo: "Trânsito em julgado", descricao: "Certificado o trânsito em julgado." },
  { dia: 371, titulo: "Cumprimento de sentença", descricao: "Intimado o INSS para implantação do benefício." },
  { dia: 430, titulo: "Arquivamento definitivo", descricao: "Autos arquivados definitivamente." },
];

const ASSUNTOS = [
  "Aposentadoria por Idade (Art. 48/51)",
  "Aposentadoria por Tempo de Contribuição (Art. 55/6)",
  "Aposentadoria Especial (Art. 57/8)",
  "Auxílio por Incapacidade Temporária",
  "Benefício Assistencial (Art. 203, V CF/88)",
  "Revisão de Benefício",
];
const ORGAOS = ["1º Juizado Especial Federal", "3ª Vara Gabinete do JEF", "5ª Vara Federal Previdenciária", "2º Juizado Especial Federal"];

const ANCHOR = "2026-10-28";

/** FNV-1a: a small stable hash so the same number always gives the same lawsuit. */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

export function demoSnapshot(numeroCnj: string, hoje: string): ProcessoSnapshot {
  const h = hash(numeroCnj);
  // A fixed anchor, so a case ages as real time passes and each sync can bring new movements.
  const distribuido = Temporal.PlainDate.from(ANCHOR).subtract({ days: 20 + (h % 520) });
  const movimentos: Movimento[] = SCRIPT.map((m) => ({ data: distribuido.add({ days: m.dia }).toString(), titulo: m.titulo, descricao: m.descricao }))
    .filter((m) => m.data <= hoje)
    .reverse();
  const arquivado = movimentos[0]?.titulo === "Arquivamento definitivo";
  return {
    numeroCnj,
    fonte: "DEMO",
    classe: "Procedimento do Juizado Especial Cível",
    assunto: ASSUNTOS[h % ASSUNTOS.length],
    tribunal: courtOf(numeroCnj) ?? "TRF3",
    orgao: ORGAOS[(h >>> 4) % ORGAOS.length],
    comarca: null,
    uf: null,
    juiz: null,
    situacao: arquivado ? "Arquivado" : "Em tramitação",
    valorCausaCentavos: (20 + (h % 60)) * 100_000,
    distribuidoEm: distribuido.toString(),
    arquivado,
    extinto: false,
    partes: [
      { nome: "PARTE AUTORA (DADOS DE DEMONSTRAÇÃO)", polo: "Ativo" },
      { nome: "INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS", polo: "Passivo" },
    ],
    movimentos,
    atualizadoNaFonteEm: movimentos[0]?.data ?? null,
  };
}

export const demoProvider = (hoje: () => string): ProcessoProvider => ({
  fonte: "DEMO",
  fetch: async (numeroCnj) => demoSnapshot(numeroCnj, hoje()),
});

/** Valid CNJ numbers for the "load examples" button: federal JEF cases (J = 4) in TRF3. */
export function demoNumbers(count: number, seed = 1): string[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String((hash(`nexo-${seed}-${i}`) % 9_000_000) + 1_000_000);
    const ano = String(2023 + (i % 4));
    return buildCnj(n, ano, "4", "03", ["6301", "6183", "6304", "6306"][i % 4]);
  });
}
