import type { CnisExtraction } from "@/cnis/parse";
import { brDate, brMonth } from "@/format";
import type { Periodo, Timeline } from "@/timeline/timeline";

// H1 metric (cnis-domain §7): compare the untouched parser output (timeline with no edits) against a
// hand-annotated answer key. An error is "flagged" when the review screen points the lawyer at it
// (REVISAR/PENDENTE, or an unparsed excerpt carrying it); otherwise it is silent, the one that kills the product.

export type AnswerKey = {
  vinculos: {
    seq: number;
    tipo: Periodo["tipo"];
    dataInicio: string | null; // YYYY-MM-DD, as printed in the CNIS
    dataFim: string | null; // null when the CNIS has no end date (an inferred end is not an extraction)
    competencias?: { competencia: string; valorCentavos: number }[]; // remuneração, or salário de contribuição
  }[];
};

export type H1Error = { item: string; kind: "ausente" | "divergente" | "espúrio"; flagged: boolean; detail: string };
type Score = { esperados: number; extraidos: number; corretos: number };
export type H1Report = { vinculos: Score; competencias: Score; errors: H1Error[] };

const reviewed = (status: string) => status !== "OK";

export function evaluateH1(extraction: CnisExtraction, timeline: Timeline, key: AnswerKey): H1Report {
  // ponytail: an item missing from the extraction counts as flagged when an unparsed excerpt contains it (substring match).
  const inUnparsed = (text: string) => extraction.unparsed.some((u) => u.rawText.includes(text));
  const errors: H1Error[] = [];
  const vinculos: Score = { esperados: key.vinculos.length, extraidos: timeline.periodos.length, corretos: 0 };
  const competencias: Score = { esperados: 0, extraidos: 0, corretos: 0 };

  const unmatched = [...timeline.periodos];
  for (const k of key.vinculos) {
    // An unreadable seq still pairs with its key item (and shows up as a seq divergence), so one defect is one error.
    const bySeq = unmatched.findIndex((p) => p.seq === k.seq);
    const at = bySeq >= 0 ? bySeq : unmatched.findIndex((p) => p.seq === null);
    const p = at >= 0 ? unmatched.splice(at, 1)[0] : undefined;
    const expected = k.competencias ?? [];
    competencias.esperados += expected.length;
    const item = `vínculo ${k.seq}`;
    if (!p) {
      errors.push({ item, kind: "ausente", flagged: !!k.dataInicio && inUnparsed(brDate(k.dataInicio)), detail: "não extraído" });
      for (const c of expected) {
        errors.push({ item: `${item} ${brMonth(c.competencia)}`, kind: "ausente", flagged: inUnparsed(brMonth(c.competencia)), detail: "vínculo não extraído" });
      }
      continue;
    }

    const got = { seq: p.seq, tipo: p.tipo, dataInicio: p.inicio, dataFim: p.fimInferido ? null : p.fim };
    const diffs = (["seq", "tipo", "dataInicio", "dataFim"] as const).filter((f) => got[f] !== k[f]).map((f) => `${f}: ${got[f] ?? "—"} ≠ ${k[f] ?? "—"}`);
    if (diffs.length) errors.push({ item, kind: "divergente", flagged: reviewed(p.status), detail: diffs.join("; ") });
    else vinculos.corretos++;

    competencias.extraidos += p.competencias.length;
    const rest = [...p.competencias];
    for (const c of expected) {
      const i = rest.findIndex((x) => x.competencia === c.competencia);
      const cItem = `${item} ${brMonth(c.competencia)}`;
      if (i < 0) {
        errors.push({ item: cItem, kind: "ausente", flagged: inUnparsed(brMonth(c.competencia)), detail: "não extraída" });
        continue;
      }
      const [x] = rest.splice(i, 1);
      if (x.valorCentavos === c.valorCentavos) competencias.corretos++;
      else errors.push({ item: cItem, kind: "divergente", flagged: reviewed(x.status), detail: `valor ${x.valorCentavos ?? "—"} ≠ ${c.valorCentavos} centavos` });
    }
    for (const x of rest) errors.push({ item: `${item} ${brMonth(x.competencia)}`, kind: "espúrio", flagged: reviewed(x.status), detail: "não existe no gabarito" });
  }
  for (const p of unmatched) {
    competencias.extraidos += p.competencias.length;
    errors.push({ item: `vínculo ${p.seq ?? "?"}`, kind: "espúrio", flagged: reviewed(p.status), detail: "não existe no gabarito" });
  }
  return { vinculos, competencias, errors };
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "—");

/** Plain-text report. Items are identified by seq and competência only: no names, NIT or CPF. */
export function formatH1(name: string, r: H1Report): string {
  const flagged = r.errors.filter((e) => e.flagged).length;
  const line = (label: string, s: Score) =>
    `  ${label.padEnd(13)} precisão ${pct(s.corretos, s.extraidos).padStart(6)}  revocação ${pct(s.corretos, s.esperados).padStart(6)}  (${s.corretos} corretos, ${s.extraidos} extraídos, ${s.esperados} no gabarito)`;
  return [
    name,
    line("vínculos", r.vinculos),
    line("competências", r.competencias),
    `  erros ${r.errors.length}: sinalizados ${flagged}, silenciosos ${r.errors.length - flagged} → sinalizados ${pct(flagged, r.errors.length)}`,
    ...r.errors.map((e) => `    ${e.flagged ? "sinalizado " : "SILENCIOSO "} ${e.kind.padEnd(10)} ${e.item}: ${e.detail}`),
  ].join("\n");
}
