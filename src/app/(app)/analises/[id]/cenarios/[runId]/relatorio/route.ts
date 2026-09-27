import { renderReport, reportData } from "@/scenarios/report";
import { loadRunView } from "@/scenarios/store";

/** Printable HTML report of one run. `?download` serves it as a file to keep. Auth is enforced by src/proxy.ts. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params;
  const view = await loadRunView(Number(id), Number(runId));
  if (!view) return new Response("Cálculo não encontrado.", { status: 404 });
  const html = renderReport(reportData(view));
  const { run } = view;
  const download = new URL(request.url).searchParams.has("download");
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store", // personal data
      ...(download ? { "Content-Disposition": `attachment; filename="nexo-calculo-${run.id}.html"` } : {}),
    },
  });
}
