import { requireSession } from "@/auth";
import { esc } from "@/scenarios/report";
import { buildChecklist, documentsToRequest } from "@/timeline/checklist";
import { loadReview } from "@/timeline/review";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });

/** Printable list of documents to ask the client for, from the analysis' open checks. Auth: src/proxy.ts, re-checked here. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const id = Number((await params).id);
  const review = Number.isSafeInteger(id) ? await loadReview(id) : undefined;
  if (!review?.timeline || !review.analysis.extraction) return new Response("Análise não encontrada.", { status: 404 });
  const items = buildChecklist(review.timeline, { unparsed: review.analysis.extraction.unparsed.length, nascimento: !!review.analysis.extraction.filiado.dataNascimento?.value });
  const docs = documentsToRequest(items);
  const tasks = items.filter((i) => i.documentos.some((d) => /^Conferir|^Consultar|^Avaliar|^Perguntar/.test(d)));

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Documentos para a análise · ${esc(review.analysis.clientLabel)}</title>
<style>
  body { font: 15px/1.55 system-ui, sans-serif; color: #262624; max-width: 760px; margin: 32px auto; padding: 0 20px; }
  h1 { font-size: 22px; margin: 0 0 4px; } .muted { color: #6b6b66; } .mark { color: #c22d2d; font-weight: 700; letter-spacing: .08em; font-size: 12px; }
  ol { padding-left: 22px; } li { margin: 10px 0; } .para { font-size: 13px; color: #6b6b66; }
  .box { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #6b6b66; border-radius: 3px; margin-right: 8px; vertical-align: -2px; }
  h2 { font-size: 15px; margin-top: 28px; border-top: 1px solid #e6e6e2; padding-top: 16px; }
  @media print { body { margin: 0 auto; } button, .office { display: none; } }
</style></head><body>
<p class="mark">✱ NEXO</p>
<h1>Documentos para a sua análise de aposentadoria</h1>
<p class="muted">Cliente: ${esc(review.analysis.clientLabel)} · ${esc(dateFmt.format(new Date()))}</p>
${
  docs.length === 0
    ? "<p>Nenhum documento pendente: o extrato do INSS (CNIS) está completo para esta análise.</p>"
    : `<p>Para conferir o seu extrato do INSS (CNIS), precisamos dos documentos abaixo. Se não tiver algum, avise: há outras formas de comprovar.</p>
<ol>${docs.map((d) => `<li><span class="box"></span>${esc(d.documento)}<div class="para">Para: ${esc(d.para.join("; "))}</div></li>`).join("")}</ol>`
}
${tasks.length ? `<section class="office"><h2>Para o escritório (não sai na impressão)</h2><ul>${tasks.map((t) => `<li>${esc(t.onde)}: ${esc(t.problema)}</li>`).join("")}</ul></section>` : ""}
<p><button onclick="window.print()">Imprimir</button></p>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
