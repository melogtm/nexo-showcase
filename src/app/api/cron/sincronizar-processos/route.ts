import { timingSafeEqual } from "node:crypto";
import { syncAll } from "@/processos/store";

/**
 * Daily re-read of every lawsuit on the board (vercel.json `crons`). Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 * Outside src/proxy.ts's session check by design; without CRON_SECRET the endpoint is closed.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET não configurado.", { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("Não autorizado.", { status: 401 });
  const r = await syncAll();
  // Counts only: CNJ numbers with errors are not personal data, but nothing else from the lawsuits is returned.
  return Response.json({ total: r.total, mudaram: r.mudaram, novas: r.novas, erros: r.erros.length });
}
