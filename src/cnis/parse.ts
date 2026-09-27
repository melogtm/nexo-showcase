import { Temporal } from "temporal-polyfill";
import { extractLines, type Line, type Segment, lineText } from "./lines";

/** Bump whenever parsing behaviour changes (stored per analysis, so H1 results compare across versions). */
export const PARSER_VERSION = 1;

export type SourceRef = { page: number; line: number; rawText: string };
/** `value` is null when the cell is empty or unreadable; unreadable cells also add a `problems` entry. */
export type Field<T> = { value: T | null; source: SourceRef };
export type UnparsedFragment = SourceRef;

export type RawRemuneracao = {
  competencia: Field<string>; // YYYY-MM
  valorCentavos: Field<number>;
  indicadores: Field<string[]>;
  agentesNocivos?: Field<string>;
  problems: string[];
};
export type RawContribuicao = {
  competencia: Field<string>;
  dataPagamento: Field<string>; // YYYY-MM-DD
  contribuicaoCentavos: Field<number>;
  salarioContribuicaoCentavos: Field<number>;
  indicadores: Field<string[]>;
  problems: string[];
};
export type RawVinculo = {
  tipo: "EMPREGO" | "BENEFICIO";
  source: SourceRef;
  seq: Field<number>;
  nit?: Field<string>;
  codigoEmp?: Field<string>;
  nb?: Field<string>;
  origem?: Field<string>;
  especie?: Field<string>;
  dataInicio?: Field<string>;
  dataFim?: Field<string>;
  tipoFiliado?: Field<string>;
  ultRemun?: Field<string>;
  situacao?: Field<string>;
  indicadores?: Field<string[]>;
  remuneracoes: RawRemuneracao[];
  contribuicoes: RawContribuicao[];
  problems: string[];
};
export type Filiado = {
  nit?: Field<string>;
  cpf?: Field<string>;
  nome?: Field<string>;
  dataNascimento?: Field<string>;
  nomeMae?: Field<string>;
  problems: string[];
};
export type LegendaItem = { codigo: Field<string>; descricao: Field<string> };
export type CnisExtraction = {
  parserVersion: number;
  filiado: Filiado;
  vinculos: RawVinculo[];
  legenda: LegendaItem[];
  unparsed: UnparsedFragment[];
};

export async function parseCnis(pdf: Uint8Array): Promise<CnisExtraction> {
  return parseLines(await extractLines(pdf));
}

// ---------- value formats ----------

type Parser<T> = (text: string) => T | null;

const parseText: Parser<string> = (s) => s;
const parseInt10: Parser<number> = (s) => (/^\d+$/.test(s) ? Number(s) : null);

const parseDate: Parser<string> = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  try {
    return Temporal.PlainDate.from({ year: +m[3], month: +m[2], day: +m[1] }, { overflow: "reject" }).toString();
  } catch {
    return null; // impossible date (31/02): the caller records it as a problem
  }
};

const parseYearMonth: Parser<string> = (s) => {
  const m = /^(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  try {
    return Temporal.PlainYearMonth.from({ year: +m[2], month: +m[1] }, { overflow: "reject" }).toString();
  } catch {
    return null;
  }
};

const parseCentavos: Parser<number> = (s) =>
  /^\d{1,3}(\.\d{3})*,\d{2}$/.test(s) ? Number(s.replace(/\./g, "").replace(",", "")) : null;

const parseIndicadores: Parser<string[]> = (s) => {
  const codes = s.split(/[\s,;]+/).filter(Boolean);
  return codes.every((c) => /^[A-Z][A-Z0-9-]*$/.test(c)) ? codes : null;
};

// ---------- columns ----------

type Column = { label: string; start: number; end: number };

/** Known header labels → [field key, parser, label shown in problems]. */
const VINCULO_COLUMNS: Record<string, [keyof RawVinculo, Parser<unknown>]> = {
  "Seq.": ["seq", parseInt10],
  NIT: ["nit", parseText],
  "Código Emp.": ["codigoEmp", parseText],
  "CNPJ/CEI/CPF": ["codigoEmp", parseText],
  NB: ["nb", parseText],
  "Origem do Vínculo": ["origem", parseText],
  Espécie: ["especie", parseText],
  "Data Início": ["dataInicio", parseDate],
  "Data Fim": ["dataFim", parseDate],
  "Tipo Filiado no Vínculo": ["tipoFiliado", parseText],
  "Últ. Remun.": ["ultRemun", parseYearMonth],
  Situação: ["situacao", parseText],
  Indicadores: ["indicadores", parseIndicadores],
};
const REMUNERACAO_COLUMNS: Record<string, [keyof RawRemuneracao, Parser<unknown>]> = {
  Competência: ["competencia", parseYearMonth],
  Remuneração: ["valorCentavos", parseCentavos],
  Indicadores: ["indicadores", parseIndicadores],
  "Agentes Nocivos": ["agentesNocivos", parseText],
};
const CONTRIBUICAO_COLUMNS: Record<string, [keyof RawContribuicao, Parser<unknown>]> = {
  Competência: ["competencia", parseYearMonth],
  "Data Pgto.": ["dataPagamento", parseDate],
  Contribuição: ["contribuicaoCentavos", parseCentavos],
  "Salário Contribuição": ["salarioContribuicaoCentavos", parseCentavos],
  Indicadores: ["indicadores", parseIndicadores],
};
const LEGEND_LABELS = ["Indicador", "Descrição"];

// Longest first, so "Indicadores" wins over "Indicador" and "Salário Contribuição" over "Contribuição".
const ALL_LABELS = [
  ...new Set([...Object.keys(VINCULO_COLUMNS), ...Object.keys(REMUNERACAO_COLUMNS), ...Object.keys(CONTRIBUICAO_COLUMNS), ...LEGEND_LABELS]),
].sort((a, b) => b.length - a.length);

/** Reads a header row into columns with x extents. Unknown words become columns too, so their values get flagged, not lost. */
function readHeader(line: Line): Column[] {
  const text = lineText(line);
  const xAt = charToX(line);
  const columns: Column[] = [];
  let unknownFrom = -1;
  const closeUnknown = (to: number) => {
    if (unknownFrom < 0) return;
    columns.push({ label: text.slice(unknownFrom, to).trim(), start: xAt(unknownFrom), end: xAt(to) });
    unknownFrom = -1;
  };
  for (let i = 0; i < text.length; ) {
    const atWordStart = i === 0 || text[i - 1] === " ";
    const label = atWordStart ? ALL_LABELS.find((l) => text.startsWith(l, i) && (i + l.length === text.length || text[i + l.length] === " ")) : undefined;
    if (label) {
      closeUnknown(i);
      columns.push({ label, start: xAt(i), end: xAt(i + label.length) });
      i += label.length;
    } else {
      if (unknownFrom < 0 && text[i] !== " ") unknownFrom = i;
      i++;
    }
  }
  closeUnknown(text.length);
  return columns;
}

/** Maps a character index of `lineText(line)` to an x position. */
function charToX(line: Line) {
  const spans: { from: number; seg: Segment }[] = [];
  let offset = 0;
  for (const seg of line.segments) {
    spans.push({ from: offset, seg });
    offset += seg.text.length + 1;
  }
  return (index: number) => {
    const span = spans.findLast((s) => s.from <= index) ?? spans[0];
    const within = Math.min(index - span.from, span.seg.text.length);
    return span.seg.x + (within / span.seg.text.length) * span.seg.width;
  };
}

/** Assigns each segment to the column it overlaps most (column spans meet halfway between headers). */
function readCells(line: Line, columns: Column[]): string[] {
  const bounds = columns.map((c, i) => (i === 0 ? -Infinity : (columns[i - 1].end + c.start) / 2));
  const cells = columns.map(() => [] as string[]);
  for (const seg of line.segments) {
    let best = 0;
    let bestOverlap = -Infinity;
    columns.forEach((_, i) => {
      const lo = Math.max(seg.x, bounds[i]);
      const hi = Math.min(seg.x + seg.width, bounds[i + 1] ?? Infinity);
      if (hi - lo > bestOverlap) [best, bestOverlap] = [i, hi - lo];
    });
    cells[best].push(seg.text);
  }
  return cells.map((c) => c.join(" "));
}

// ---------- line classification ----------

const PAGE_CHROME = [
  /^Página \d+ de \d+$/,
  /^INSS\s*-\s*INSTITUTO NACIONAL DO SEGURO SOCIAL$/,
  /^CNIS\s*-\s*Cadastro Nacional de Informações Sociais$/,
  /^Extrato Previdenciário( \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})?$/,
  /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/, // issue timestamp, on its own line in the 2019 issue
  /^O INSS poderá rever a qualquer tempo as informações constantes deste extrato, conforme art\. 19, § 3° do Decreto 3\.048\/99\.$/,
  /^Você pode conferir a autenticidade do documento em$/,
  /^https:\/\/meu\.inss\.gov\.br\/\S*$/,
  /^com o código \w+$/,
];
const SECTION_TITLES = new Set(["Identificação do Filiado", "Relações Previdenciárias", "Remunerações", "Contribuições", "Legenda de Indicadores"]);
const FILIADO_LABELS = /(Nome da mãe|Data de nascimento|NIT|CPF|Nome):/g;
// Format checks also catch an unknown "Label: value" pair absorbed into the preceding value.
const parseNit: Parser<string> = (s) => (/^\d{3}\.\d{5}\.\d{2}-\d$/.test(s) ? s : null);
const parseCpf: Parser<string> = (s) => (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(s) ? s : null);
const FILIADO_KEYS: Record<string, [keyof Filiado, Parser<string>]> = {
  NIT: ["nit", parseNit],
  CPF: ["cpf", parseCpf],
  Nome: ["nome", parseText],
  "Data de nascimento": ["dataNascimento", parseDate],
  "Nome da mãe": ["nomeMae", parseText],
};

type Table =
  | { kind: "vinculo"; columns: Column[] }
  | { kind: "remuneracao" | "contribuicao" | "legenda"; columns: Column[] };

export function parseLines(lines: Line[]): CnisExtraction {
  const out: CnisExtraction = { parserVersion: PARSER_VERSION, filiado: { problems: [] }, vinculos: [], legenda: [], unparsed: [] };
  let table: Table | null = null;
  let legendTail: (LegendaItem | undefined)[] = [];

  for (const line of lines) {
    const text = lineText(line);
    const ref = (rawText: string): SourceRef => ({ page: line.page, line: line.line, rawText });
    const unparsed = (rawText = text) => out.unparsed.push(ref(rawText));

    if (PAGE_CHROME.some((re) => re.test(text))) continue; // recognised: repeated page furniture
    if (SECTION_TITLES.has(text)) {
      if (text === "Relações Previdenciárias" || text === "Legenda de Indicadores") table = null;
      continue;
    }
    if (/^(NIT|CPF|Nome|Data de nascimento|Nome da mãe):/.test(text)) {
      readFiliado(text, ref, out.filiado);
      continue;
    }

    const header = readHeader(line);
    const labels = new Set(header.map((c) => c.label));
    if (labels.has("Seq.") && labels.has("Origem do Vínculo")) {
      table = { kind: "vinculo", columns: header };
      continue;
    }
    if (header[0]?.label === "Competência" && (labels.has("Remuneração") || labels.has("Data Pgto."))) {
      table = { kind: labels.has("Data Pgto.") ? "contribuicao" : "remuneracao", columns: header };
      continue;
    }
    if (header[0]?.label === "Indicador" && labels.has("Descrição")) {
      table = { kind: "legenda", columns: header };
      legendTail = [];
      continue;
    }

    if (!table) {
      unparsed();
      continue;
    }
    const cells = readCells(line, table.columns);

    if (table.kind === "vinculo") {
      const vinculo = readVinculo(table.columns, cells, ref, text);
      if (vinculo) out.vinculos.push(vinculo);
      else unparsed();
      continue;
    }

    if (table.kind === "legenda") {
      // Groups of [Indicador, Descrição]; a row without a code continues the previous description of that group.
      groups(table.columns, "Indicador").forEach((cols, g) => {
        const [codigo, descricao] = cols.map((i) => cells[i] ?? "");
        if (codigo) {
          legendTail[g] = { codigo: { value: codigo, source: ref(codigo) }, descricao: { value: descricao || null, source: ref(descricao) } };
          out.legenda.push(legendTail[g]!);
        } else if (descricao && legendTail[g]) {
          const d = legendTail[g]!.descricao;
          d.value = d.value ? `${d.value} ${descricao}` : descricao;
          d.source.rawText = `${d.source.rawText} ${descricao}`.trim();
        } else if (descricao) {
          unparsed(descricao);
        }
      });
      continue;
    }

    // Remuneração / contribuição grid: repeated groups starting at "Competência". Order across the grid is not trusted.
    const vinculo = out.vinculos.at(-1);
    if (!vinculo) {
      unparsed();
      continue;
    }
    const spec = table.kind === "remuneracao" ? REMUNERACAO_COLUMNS : CONTRIBUICAO_COLUMNS;
    for (const cols of groups(table.columns, "Competência")) {
      const groupText = cols.map((i) => cells[i]).filter(Boolean).join(" ");
      if (!groupText) continue; // empty slot at the end of the grid
      const competencia = parseYearMonth(cells[cols[0]]);
      if (!competencia) {
        unparsed(groupText);
        continue;
      }
      const record = readRecord(cols.map((i) => [table!.columns[i].label, cells[i]]), spec, ref);
      if (table.kind === "remuneracao") vinculo.remuneracoes.push(record as RawRemuneracao);
      else vinculo.contribuicoes.push(record as RawContribuicao);
    }
  }

  for (const v of out.vinculos) {
    const byCompetencia = (a: { competencia: Field<string> }, b: { competencia: Field<string> }) =>
      (a.competencia.value ?? "").localeCompare(b.competencia.value ?? "");
    v.remuneracoes.sort(byCompetencia);
    v.contribuicoes.sort(byCompetencia);
  }
  return out;
}

/** Column indexes split into groups, each starting at `first`. */
function groups(columns: Column[], first: string): number[][] {
  const result: number[][] = [];
  columns.forEach((c, i) => (c.label === first || result.length === 0 ? result.push([i]) : result.at(-1)!.push(i)));
  return result;
}

function readRecord<K extends string>(
  cells: [string, string][],
  spec: Record<string, [K, Parser<unknown>]>,
  ref: (raw: string) => SourceRef,
): Record<K, Field<unknown>> & { problems: string[] } {
  const record = { problems: [] as string[] } as Record<K, Field<unknown>> & { problems: string[] };
  for (const [label, raw] of cells) {
    const known = spec[label];
    if (!known) {
      if (raw) record.problems.push(`Coluna não reconhecida "${label}": "${raw}"`);
      continue;
    }
    const [key, parse] = known;
    const value = raw ? parse(raw) : null;
    if (raw && value === null) record.problems.push(`${label} ilegível: "${raw}"`);
    record[key] = { value, source: ref(raw) } as never;
  }
  return record;
}

function readVinculo(columns: Column[], cells: string[], ref: (raw: string) => SourceRef, text: string): RawVinculo | null {
  const seqIndex = columns.findIndex((c) => c.label === "Seq.");
  if (parseInt10(cells[seqIndex]) === null) return null;
  const labels = new Set(columns.map((c) => c.label));
  const record = readRecord(columns.map((c, i) => [c.label, cells[i]]), VINCULO_COLUMNS, ref);
  return {
    ...record,
    tipo: labels.has("NB") || labels.has("Espécie") ? "BENEFICIO" : "EMPREGO",
    source: ref(text),
    remuneracoes: [],
    contribuicoes: [],
  } as unknown as RawVinculo;
}

function readFiliado(text: string, ref: (raw: string) => SourceRef, filiado: Filiado) {
  const matches = [...text.matchAll(FILIADO_LABELS)];
  matches.forEach((m, i) => {
    const raw = text.slice(m.index + m[0].length, matches[i + 1]?.index ?? text.length).trim();
    const [key, parse] = FILIADO_KEYS[m[1]];
    const value = raw ? parse(raw) : null;
    if (raw && value === null) filiado.problems.push(`${m[1]} ilegível`);
    const current = filiado[key] as Field<string> | undefined;
    // The block repeats on every page: keep the first reading, flag disagreement (without echoing personal data).
    if (!current || current.value === null) (filiado[key] as Field<string>) = { value, source: ref(raw) };
    else if (value !== null && value !== current.value) filiado.problems.push(`${m[1]} diverge entre páginas`);
  });
}
