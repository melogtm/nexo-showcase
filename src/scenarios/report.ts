import { brDate } from "@/format";
import { union } from "@/timeline/timeline";
import type { Resultado, RuleVersion, ScenarioInput, TrailNode } from "./evaluate";
import { earliest, humanize, inDisplayOrder, paramValue, requirementText, RMI_RESSALVA, rmiBasis, rmiValue, verdict } from "./present";

// Self-contained printable HTML report of one calculation_run (no external assets; opens offline, prints cleanly).

export type ReportData = {
  runId: number;
  clientLabel: string;
  filiado: { nome: string | null; nit: string | null };
  referenceDate: string;
  createdAt: Date;
  pdfSha256: string;
  input: ScenarioInput;
  resultados: Resultado[];
  /** Salário de benefício and the corrected salários (runs with an RMI rule version only). */
  rmiTrail?: TrailNode;
  versions: Map<number, RuleVersion>;
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export function renderReport(d: ReportData): string {
  const first = earliest(d.resultados);
  const rules = inDisplayOrder(d.resultados)
    .map((r) => {
      const v = verdict(r);
      const version = d.versions.get(r.ruleVersionId);
      const reqs = r.requisitos
        .map((q) => {
          const param = version ? paramValue(version.parameters, q.param) : undefined;
          return `<tr><td>${q.atendido ? "✓" : "✗"}</td><td>${esc(q.label)}</td><td>${esc(requirementText(q))}</td><td class="muted">${esc(q.param)}${param !== undefined && typeof param !== "object" ? ` = ${esc(param)}` : ""}</td></tr>`;
        })
        .join("");
      return `<section class="rule">
  <h3>${esc(r.nome)} <small>${esc(r.legalBasis)} · versão ${r.version} · ${esc(version?.contentHash.slice(0, 12) ?? "")}</small></h3>
  <p class="verdict ${v.kind}">${esc(v.text)}</p>${r.motivo ? `\n  <p class="muted">${esc(r.motivo)}</p>` : ""}${r.rmi ? `\n  <p>Valor estimado (RMI): <strong>${esc(rmiValue(r.rmi))}</strong> <span class="muted">· ${esc(rmiBasis(r.rmi))}</span></p>` : ""}
  ${reqs ? `<table><thead><tr><th></th><th>Requisito</th><th>Situação em ${esc(brDate(d.referenceDate))}</th><th>Parâmetro</th></tr></thead><tbody>${reqs}</tbody></table>` : ""}
</section>`;
    })
    .join("\n");
  const periodos = d.input.periodos
    .map((p) => `<tr><td>${esc(p.seq ?? "?")}</td><td>${esc(p.origem ?? "—")}</td><td>${esc(union(p.intervalos).map((i) => humanize(`${i.inicio}..${i.fim}`)).join(", "))}</td><td>p. ${p.source.page}, l. ${p.source.line}</td><td>${p.editIds.length ? `edições nº ${p.editIds.join(", ")}` : "—"}</td></tr>`)
    .join("");
  const media = d.rmiTrail?.children?.[0];
  const salarios = (media?.children ?? []).map((n) => `<tr><td>${esc(humanize(n.label))}</td><td>${esc(humanize(n.value ?? ""))}</td></tr>`).join("");
  const rmiSection = media
    ? `<h2>Salários corrigidos (RMI)</h2>
<p>${esc(humanize(media.label))}: <strong>${esc(humanize(media.value ?? ""))}</strong>. ${esc(humanize(d.rmiTrail?.children?.[1]?.value ?? ""))}. ${esc(RMI_RESSALVA)}</p>
<table><thead><tr><th>Competência</th><th>Salário × fator INPC = corrigido</th></tr></thead><tbody>${salarios}</tbody></table>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nexo · ${esc(d.clientLabel)} · cálculo nº ${d.runId}</title>
<style>
  :root { --red: #c22d2d; --ink: #343431; --muted: #7e7e7e; --line: #e4e4e1; }
  body { font: 14px/1.5 system-ui, sans-serif; color: var(--ink); max-width: 900px; margin: 0 auto; padding: 24px 16px; }
  h1 { font: 400 2.4rem/1 Georgia, serif; color: var(--red); margin: 0 0 4px; }
  h2 { font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; margin: 28px 0 8px; }
  h3 { font: 400 1.35rem/1.2 Georgia, serif; margin: 0; }
  h3 small { display: block; font: 0.75rem system-ui, sans-serif; color: var(--muted); letter-spacing: 0.04em; margin-top: 2px; }
  .muted { color: var(--muted); }
  .rule { border-top: 2px solid var(--line); padding: 12px 0; break-inside: avoid; }
  .verdict { font-weight: 700; margin: 6px 0; }
  .verdict.later { color: var(--red); }
  .highlight { border-left: 3px solid var(--red); padding: 8px 12px; background: #fbf4f4; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { text-align: left; padding: 4px 8px 4px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  code { font-size: 0.75rem; word-break: break-all; }
  footer { margin-top: 32px; font-size: 0.75rem; color: var(--muted); }
  @media print { body { padding: 0; } a { color: inherit; } }
</style>
</head>
<body>
<p class="muted">✱ NEXO · Relatório de cenários</p>
<h1>${esc(d.clientLabel)}</h1>
<p>${esc(d.filiado.nome ?? "—")} · NIT ${esc(d.filiado.nit ?? "—")} · nascimento ${esc(d.input.nascimento ? brDate(d.input.nascimento.value) : "—")} · sexo ${d.input.sexo === "F" ? "feminino" : d.input.sexo === "M" ? "masculino" : "—"}</p>
<p class="muted">Cálculo nº ${d.runId} · referência ${esc(brDate(d.referenceDate))} · gerado em ${esc(dateTime.format(d.createdAt))}</p>
${first ? `<p class="highlight">Regra atingida mais cedo: <strong>${esc(first.nome)}</strong> (${esc(verdict(first).text.toLowerCase())}). Mais cedo não significa mais vantajoso${d.rmiTrail ? ": compare também o valor estimado de cada regra" : ": este cálculo não estimou o valor do benefício"}.</p>` : ""}
<h2>Cenários</h2>
${rules}
${rmiSection}
<h2>Períodos contados</h2>
<table><thead><tr><th>Seq.</th><th>Origem</th><th>Intervalos</th><th>No CNIS</th><th>Alterado por</th></tr></thead><tbody>${periodos || '<tr><td colspan="5">Nenhum período contado.</td></tr>'}</tbody></table>
<footer>
  <p>Reprodutibilidade: este cálculo guarda seus insumos e as versões de regra usadas; pode ser reexecutado no Nexo com resultado idêntico. PDF de origem (SHA-256): <code>${esc(d.pdfSha256)}</code></p>
  <p>Parâmetros das regras são premissas de um projeto acadêmico (ACH2008, EACH/USP) a partir da EC 103/2019, não verificadas juridicamente. Este relatório não é aconselhamento jurídico.</p>
</footer>
</body>
</html>
`;
}
