import { brDate } from "@/format";
import { humanize, requirementText, rmiBasis, rmiValue, RMI_RESSALVA } from "./present";
import { esc, type ReportData } from "./report";

// Petition draft (minuta) for one rule of one calculation_run. A fixed template filled only with the run's own data:
// no LLM, so every sentence is traceable to the calculation. What the CNIS cannot give stays a visible [●] blank.

const BLANK = `<mark>[●]</mark>`;
const or = (value: string | null | undefined) => (value ? esc(value) : BLANK);

/** undefined when the run has no applicable result for `ruleCode`. */
export function renderPetition(d: ReportData, ruleCode: string): string | undefined {
  const r = d.resultados.find((x) => x.ruleCode === ruleCode && x.aplicavel);
  if (!r) return undefined;
  const version = d.versions.get(r.ruleVersionId);
  const periodos = d.input.periodos
    .map((p) => `<li>${esc(p.origem ?? "vínculo")} (seq. ${esc(p.seq ?? "?")}): ${esc(humanize(p.intervalos.map((i) => `${i.inicio}..${i.fim}`).join(", ")))}, conforme CNIS, p. ${p.source.page}, l. ${p.source.line}.</li>`)
    .join("");
  const requisitos = r.requisitos.map((q) => `<li>${esc(q.label)}: ${esc(requirementText(q))} ${q.atendido ? "(preenchido)" : "<strong>(não preenchido)</strong>"}.</li>`).join("");
  const aviso = r.elegivelHoje
    ? ""
    : `<p class="aviso">Atenção: em ${esc(brDate(d.referenceDate))} os requisitos desta regra não estão preenchidos${r.dataProjetada ? ` (data projetada: ${esc(brDate(r.dataProjetada))})` : ""}. Esta minuta serve apenas ao planejamento; não protocolar.</p>`;
  const valor =
    r.rmi && r.rmi.valorCentavos !== null
      ? `<p>A renda mensal inicial estimada é de <strong>${esc(rmiValue(r.rmi))}</strong>, correspondente a ${esc(rmiBasis(r.rmi))}, sem prejuízo do cálculo definitivo pela Autarquia.</p>`
      : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Minuta · ${esc(d.clientLabel)} · ${esc(r.nome)}</title>
<style>
  body { font: 16px/1.7 Georgia, "Times New Roman", serif; color: #343431; max-width: 760px; margin: 0 auto; padding: 32px 16px; }
  h1 { font-size: 1rem; text-align: center; text-transform: uppercase; letter-spacing: 0.04em; margin: 2rem 0; }
  h2 { font-size: 1rem; text-transform: uppercase; margin: 1.8rem 0 0.6rem; }
  p { text-align: justify; margin: 0 0 0.9rem; }
  mark { background: #fbe9e9; color: #c22d2d; }
  .aviso { border-left: 3px solid #c22d2d; padding: 8px 12px; background: #fbf4f4; font-family: system-ui, sans-serif; font-size: 0.9rem; }
  .nota { font: 0.75rem/1.5 system-ui, sans-serif; color: #7e7e7e; border-top: 1px solid #e4e4e1; margin-top: 2.5rem; padding-top: 0.8rem; }
  @media print { .aviso, .nota { display: none; } body { padding: 0; } }
</style>
</head>
<body>
${aviso}
<p><strong>EXCELENTÍSSIMO(A) SENHOR(A) JUIZ(A) FEDERAL DO JUIZADO ESPECIAL FEDERAL DE ${BLANK}</strong></p>

<p><strong>${or(d.filiado.nome)}</strong>, ${BLANK} (nacionalidade), ${BLANK} (estado civil), nascido(a) em ${d.input.nascimento ? esc(brDate(d.input.nascimento.value)) : BLANK}, inscrito(a) no CPF sob o nº ${or(d.filiado.cpf)} e no NIT sob o nº ${or(d.filiado.nit)}, residente em ${BLANK}, por seu(sua) advogado(a) (procuração anexa), vem propor</p>

<h1>Ação de concessão de aposentadoria</h1>

<p>em face do <strong>INSTITUTO NACIONAL DO SEGURO SOCIAL – INSS</strong>, autarquia federal, pelos fatos e fundamentos a seguir.</p>

<h2>I. Dos fatos</h2>
<p>O(A) autor(a) requereu o benefício administrativamente em ${BLANK} (DER), sob o NB ${BLANK}, e teve o pedido ${BLANK}. Conforme o Extrato Previdenciário (CNIS) anexo, conta com os seguintes períodos de contribuição:</p>
<ol>${periodos || "<li>Nenhum período computado.</li>"}</ol>

<h2>II. Do direito</h2>
<p>O(A) autor(a) faz jus à aposentadoria pela <strong>${esc(r.nome)}</strong> (${esc(r.legalBasis)}), cujos requisitos, apurados em ${esc(brDate(d.referenceDate))}, são:</p>
<ul>${requisitos}</ul>
${valor}
<p>A memória de cálculo anexa (cálculo nº ${d.runId}) indica, para cada número, o período do CNIS de origem e o parâmetro legal aplicado.</p>

<h2>III. Dos pedidos</h2>
<p>Diante do exposto, requer:</p>
<ol type="a">
  <li>a citação do INSS para, querendo, contestar a presente ação;</li>
  <li>o reconhecimento dos períodos de contribuição acima relacionados;</li>
  <li>a concessão da aposentadoria pela ${esc(r.nome)} (${esc(r.legalBasis)}), com DIB na DER (${BLANK});</li>
  <li>o pagamento das parcelas vencidas desde a DIB, com correção monetária e juros de mora;</li>
  <li>a concessão dos benefícios da justiça gratuita ${BLANK};</li>
  <li>a produção de todas as provas em direito admitidas.</li>
</ol>
<p>Dá-se à causa o valor de R$ ${BLANK}.</p>
<p>Nestes termos, pede deferimento.</p>
<p>${BLANK}, ${BLANK}.</p>
<p>${BLANK}<br>OAB/${BLANK} nº ${BLANK}</p>

<p class="nota">✱ NEXO · Minuta gerada a partir do cálculo nº ${d.runId} (${esc(r.nome)}, versão ${r.version}${version ? ` · ${esc(version.contentHash.slice(0, 12))}` : ""}), CNIS SHA-256 ${esc(d.pdfSha256.slice(0, 16))}…. Modelo fixo, sem inteligência artificial: revise todo o texto e preencha os campos [●].${r.rmi?.valorCentavos != null ? ` Valor do benefício: ${esc(RMI_RESSALVA)}` : ""} Projeto acadêmico (ACH2008, EACH/USP); não é aconselhamento jurídico.</p>
</body>
</html>
`;
}
