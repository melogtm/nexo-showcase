import { connection } from "next/server";
import { Temporal } from "temporal-polyfill";
import { brDate, brDateTime, daysAgo, today } from "@/format";
import { listAnalyses } from "@/ingestion/ingest";
import { getProvider } from "@/processos/provider";
import { listProcessos } from "@/processos/store";
import { PageHeader } from "../ui";
import { carregarExemplos } from "./actions";
import { Board, type CardData } from "./board";
import { ImportForm } from "./import-form";

export const metadata = { title: "Processos · Nexo" };


export default async function ProcessosPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  await connection();
  const [{ filtro = "" }, processos, analyses] = await Promise.all([searchParams, listProcessos(), listAnalyses()]);
  const hoje = today();
  const semana = Temporal.PlainDate.from(hoje).subtract({ days: 7 }).toString();
  const label = new Map(analyses.map((a) => [a.id, a.clientLabel]));
  const demo = getProvider().fonte === "DEMO";

  const cards: CardData[] = processos.map((p) => {
    const s = p.snapshot;
    const last = s.movimentos[0];
    return {
      id: p.id,
      numeroCnj: p.numeroCnj,
      stage: p.stage,
      manual: p.stageOrigem === "MANUAL",
      motivo: p.stageMotivo,
      titulo: s.assunto ?? s.classe ?? "Processo",
      clientLabel: p.clientLabel ?? (p.analysisId ? label.get(p.analysisId) ?? null : null),
      analysisId: p.analysisId,
      local: [s.tribunal, s.orgao].filter(Boolean).join(" · ") || "Tribunal não informado",
      ultima: last ? { data: brDate(last.data), titulo: last.titulo, quando: daysAgo(last.data, hoje) } : null,
      recente: !!p.ultimaMovimentacaoEm && p.ultimaMovimentacaoEm >= semana,
    };
  });
  const lastSync = processos.length ? brDateTime(new Date(Math.max(...processos.map((p) => p.sincronizadoEm.getTime())))) : null;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/", label: "Painel" }]}
        title="Processos"
        sub="Acompanhe cada processo por etapa. As colunas são atualizadas pelas movimentações do Jusbrasil; arraste um card para mudar manualmente."
      />
      <div className="page-body wide">
        <ImportForm analyses={analyses.map((a) => ({ id: a.id, clientLabel: a.clientLabel }))} demo={demo} defaultOpen={processos.length === 0} />
        {processos.length === 0 ? (
          <section className="card">
            <div className="empty">
              <strong>Nenhum processo no quadro</strong>
              <span>Importe pelo número CNJ acima{demo ? " ou carregue processos de exemplo para experimentar o quadro." : "."}</span>
              {demo && (
                <form action={carregarExemplos}>
                  <button type="submit" className="button button-secondary">Carregar 8 processos de exemplo</button>
                </form>
              )}
            </div>
          </section>
        ) : (
          <Board cards={cards} initialFilter={filtro} lastSync={lastSync} />
        )}
      </div>
    </>
  );
}
