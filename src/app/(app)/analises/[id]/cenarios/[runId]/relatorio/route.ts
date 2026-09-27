import { renderReport } from "@/scenarios/report";
import { loadRunView } from "@/scenarios/store";

/** Printable HTML report of one run. `?download` serves it as a file to keep. Auth is enforced by src/proxy.ts. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params;
  const view = await loadRunView(Number(id), Number(runId));
  if (!view) return new Response("Cálculo não encontrado.", { status: 404 });
  const { run, analysis, versions } = view;
  const html = renderReport({
    runId: run.id,
    clientLabel: analysis.clientLabel,
    filiado: { nome: analysis.extraction?.filiado.nome?.value ?? null, nit: analysis.extraction?.filiado.nit?.value ?? null },
    referenceDate: run.referenceDate,
    createdAt: run.createdAt,
    pdfSha256: run.pdfSha256,
    input: run.timelineSnapshot,
    resultados: run.result,
    rmiTrail: run.trail.EC103_ART26_RMI,
    versions,
  });
  const download = new URL(request.url).searchParams.has("download");
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store", // personal data
      ...(download ? { "Content-Disposition": `attachment; filename="nexo-calculo-${run.id}.html"` } : {}),
    },
  });
}
