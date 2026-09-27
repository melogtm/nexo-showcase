import { PDFDocument, type PDFFont, type PDFPage, StandardFonts } from "pdf-lib";
import { brDate, brMoney, brMonth } from "@/format";

// Synthetic CNIS generator for tests (and, later, demo data). It imitates the layout recorded in the
// cnis-domain skill (2017/2019 "Extrato Previdenciário"). It is NOT proof the parser reads real extracts.

export type SyntheticRemuneracao = { competencia: string; valorCentavos: number; indicadores?: string[] }; // YYYY-MM
export type SyntheticContribuicao = {
  competencia: string;
  dataPagamento: string; // YYYY-MM-DD
  contribuicaoCentavos: number;
  salarioContribuicaoCentavos: number;
  indicadores?: string[];
};
export type SyntheticVinculo =
  | {
      tipo: "EMPREGO";
      seq: number;
      nit: string;
      codigoEmp: string;
      origem: string;
      dataInicio: string;
      dataFim?: string;
      tipoFiliado: string;
      ultRemun?: string;
      indicadores?: string[];
      remuneracoes?: SyntheticRemuneracao[];
      contribuicoes?: SyntheticContribuicao[];
    }
  | { tipo: "BENEFICIO"; seq: number; nit: string; nb: string; origem: string; especie: string; dataInicio: string; dataFim?: string; situacao: string };

export type SyntheticCnis = {
  emitidoEm: string; // "dd/MM/yyyy HH:mm:ss"
  filiado: { nit: string; cpf: string; nome: string; dataNascimento: string; nomeMae: string };
  vinculos: SyntheticVinculo[];
  legenda: { codigo: string; descricao: string }[];
  /** Unexpected text drawn after the first vínculo block, to exercise UnparsedFragment. */
  ruido?: string[];
};


const PAGE: [number, number] = [842, 595]; // A4 landscape
const LEFT = 30;
const TOP = 470;
const BOTTOM = 50;
const ROW = 11;
const SIZE = 7;

type Cols = [string, number][];
const EMPREGO_COLS: Cols = [["Seq.", 30], ["NIT", 60], ["Código Emp.", 140], ["Origem do Vínculo", 240], ["Data Início", 440], ["Data Fim", 500], ["Tipo Filiado no Vínculo", 560], ["Últ. Remun.", 670], ["Indicadores", 730]];
const BENEFICIO_COLS: Cols = [["Seq.", 30], ["NIT", 60], ["NB", 140], ["Origem do Vínculo", 240], ["Espécie", 330], ["Data Início", 560], ["Data Fim", 620], ["Situação", 700]];
const repeat3 = (group: Cols, width: number): Cols => [0, 1, 2].flatMap((g) => group.map(([l, x]): [string, number] => [l, LEFT + g * width + x]));
const REMUNERACAO_COLS = repeat3([["Competência", 0], ["Remuneração", 70], ["Indicadores", 150]], 270);
const CONTRIBUICAO_COLS = repeat3([["Competência", 0], ["Data Pgto.", 45], ["Contribuição", 95], ["Salário Contribuição", 150], ["Indicadores", 225]], 270);
const LEGEND_COLS: Cols = [["Indicador", 30], ["Descrição", 110], ["Indicador", 430], ["Descrição", 510]];

export async function renderCnis(cnis: SyntheticCnis): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const [font, bold] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold)]);
  let page!: PDFPage;
  let y = 0;
  const text = (s: string, x: number, at: number, f: PDFFont = font, size = SIZE) => s && page.drawText(s, { x, y: at, size, font: f });

  const newPage = () => {
    page = doc.addPage(PAGE);
    text("INSS - INSTITUTO NACIONAL DO SEGURO SOCIAL", 300, 565, bold, 9);
    text("CNIS - Cadastro Nacional de Informações Sociais", 295, 553, font, 9);
    text("Extrato Previdenciário", 350, 541, font, 9);
    text(cnis.emitidoEm, 720, 541);
    text("Identificação do Filiado", LEFT, 515, bold, 8);
    text(`NIT: ${cnis.filiado.nit}`, LEFT, 503);
    text(`CPF: ${cnis.filiado.cpf}`, 250, 503);
    text(`Nome: ${cnis.filiado.nome}`, 450, 503);
    text(`Data de nascimento: ${brDate(cnis.filiado.dataNascimento)}`, LEFT, 492);
    text(`Nome da mãe: ${cnis.filiado.nomeMae}`, 450, 492);
    text("O INSS poderá rever a qualquer tempo as informações constantes deste extrato, conforme art. 19, § 3° do Decreto 3.048/99.", 170, 25);
    y = TOP;
  };
  /** Moves to the next row; on a page break, repeats `header` (a table continuing on the next page). */
  const nextRow = (header?: Cols) => {
    y -= ROW;
    if (y >= BOTTOM) return;
    newPage();
    if (header) {
      header.forEach(([label, x]) => text(label, x, y, bold));
      y -= ROW;
    }
  };
  const row = (cols: Cols, values: string[]) => cols.forEach(([, x], i) => text(values[i] ?? "", x, y));
  const headerRow = (cols: Cols) => {
    nextRow();
    cols.forEach(([label, x]) => text(label, x, y, bold));
  };
  /** Grid filled column-major (down, then across), like the 2017 issue. */
  const grid = (cols: Cols, cells: string[][]) => {
    const rows = Math.ceil(cells.length / 3);
    for (let r = 0; r < rows; r++) {
      nextRow(cols);
      row(cols, [0, 1, 2].flatMap((g) => cells[g * rows + r] ?? cols.slice(0, cols.length / 3).map(() => "")));
    }
  };

  newPage();
  text("Relações Previdenciárias", LEFT, y, bold, 8);
  cnis.vinculos.forEach((v, i) => {
    nextRow();
    if (v.tipo === "BENEFICIO") {
      headerRow(BENEFICIO_COLS);
      nextRow(BENEFICIO_COLS);
      row(BENEFICIO_COLS, [String(v.seq), v.nit, v.nb, v.origem, v.especie, brDate(v.dataInicio), v.dataFim ? brDate(v.dataFim) : "", v.situacao]);
    } else {
      headerRow(EMPREGO_COLS);
      nextRow(EMPREGO_COLS);
      row(EMPREGO_COLS, [
        String(v.seq), v.nit, v.codigoEmp, v.origem, brDate(v.dataInicio), v.dataFim ? brDate(v.dataFim) : "",
        v.tipoFiliado, v.ultRemun ? brMonth(v.ultRemun) : "", (v.indicadores ?? []).join(" "),
      ]);
      if (v.remuneracoes?.length) {
        nextRow();
        text("Remunerações", LEFT, y, bold);
        headerRow(REMUNERACAO_COLS);
        grid(REMUNERACAO_COLS, v.remuneracoes.map((r) => [brMonth(r.competencia), brMoney(r.valorCentavos), (r.indicadores ?? []).join(" ")]));
      }
      if (v.contribuicoes?.length) {
        nextRow();
        text("Contribuições", LEFT, y, bold);
        headerRow(CONTRIBUICAO_COLS);
        grid(CONTRIBUICAO_COLS, v.contribuicoes.map((c) => [
          brMonth(c.competencia), brDate(c.dataPagamento), brMoney(c.contribuicaoCentavos), brMoney(c.salarioContribuicaoCentavos), (c.indicadores ?? []).join(" "),
        ]));
      }
    }
    if (i === 0) {
      for (const noise of cnis.ruido ?? []) {
        nextRow();
        text(noise, LEFT, y);
      }
    }
  });

  nextRow();
  nextRow();
  text("Legenda de Indicadores", LEFT, y, bold, 8);
  headerRow(LEGEND_COLS);
  for (let i = 0; i < cnis.legenda.length; i += 2) {
    const pair = [cnis.legenda[i], cnis.legenda[i + 1]].map((item) => (item ? [item.codigo, ...wrap(item.descricao, 60)] : []));
    for (let l = 0; l < Math.max(pair[0].length, pair[1].length); l++) {
      nextRow(LEGEND_COLS);
      // The code only on the first line of each entry; the description wraps below it.
      row(LEGEND_COLS, [l === 0 ? pair[0][0] ?? "" : "", pair[0][l + 1] ?? "", l === 0 ? pair[1][0] ?? "" : "", pair[1][l + 1] ?? ""]);
    }
  }
  nextRow();
  nextRow();
  text("Você pode conferir a autenticidade do documento em", 300, y);
  nextRow();
  text("https://meu.inss.gov.br/central/#/autenticidade", 320, y);
  nextRow();
  text("com o código 000SINTETICO0", 330, y);

  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`Página ${i + 1} de ${pages.length}`, { x: 740, y: 580, size: SIZE, font }));
  return doc.save();
}

function wrap(s: string, width: number): string[] {
  const lines: string[] = [];
  for (const word of s.split(" ")) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + word.length + 1 <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}
