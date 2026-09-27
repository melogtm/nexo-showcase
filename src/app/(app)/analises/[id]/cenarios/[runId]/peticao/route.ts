import { renderPetition } from "@/scenarios/petition";
import { reportData } from "@/scenarios/report";
import { loadRunView } from "@/scenarios/store";

/** Petition draft for one rule of a run: `?regra=<rule_code>`, `&download` to keep it. Auth is enforced by src/proxy.ts. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params;
  const view = await loadRunView(Number(id), Number(runId));
  const url = new URL(request.url);
  const html = view && renderPetition(reportData(view), url.searchParams.get("regra") ?? "");
  if (!view || !html) return new Response("Minuta não encontrada.", { status: 404 });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store", // personal data
      ...(url.searchParams.has("download") ? { "Content-Disposition": `attachment; filename="nexo-minuta-${view.run.id}.html"` } : {}),
    },
  });
}
