import Link from "next/link";
import { connection } from "next/server";
import { brDate } from "@/format";
import { today } from "@/processos/provider";
import { STAGES } from "@/processos/stages";
import { listProcessos, recentMovimentos } from "@/processos/store";
import { retirementAlerts } from "@/scenarios/alerts";
import { analysesOverview } from "@/scenarios/progress";
import { waitText } from "@/scenarios/present";
import { Badge, Icon, PageHeader, daysAgo } from "./ui";

const longDate = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function Dashboard() {
  await connection();
  const [analyses, processos, feed] = await Promise.all([analysesOverview(), listProcessos(), recentMovimentos(8)]);
  const hoje = today();
  const semana = new Date(Date.parse(`${hoje}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const paraRevisar = analyses.filter((a) => a.next.step === "REVISAR" || a.next.step === "DADOS");
  const paraCalcular = analyses.filter((a) => a.next.step === "CALCULAR" || a.next.step === "RECALCULAR");
  const ativos = processos.filter((p) => p.stage !== "CONCLUIDO");
  const movimentaram = processos.filter((p) => p.ultimaMovimentacaoEm && p.ultimaMovimentacaoEm >= semana);
  const pendentes = analyses.filter((a) => a.next.step !== "PRONTO").slice(0, 6);
  // Horizon of the retirement alert: a UI choice (how far ahead the office plans), not a legal parameter.
  const HORIZONTE_MESES = 24;
  const alertas = retirementAlerts(
    analyses.flatMap((a) => (a.baseRun ? [{ analysisId: a.id, clientLabel: a.clientLabel, runId: a.baseRun.id, referenceDate: a.baseRun.referenceDate, result: a.baseRun.result }] : [])),
    hoje,
    HORIZONTE_MESES,
  );

  return (
    <>
      <PageHeader
        title="Painel"
        sub={capitalize(longDate.format(new Date()))}
        actions={
          <>
            <Link href="/processos#importar" className="button button-secondary"><Icon name="plus" /> Importar processo</Link>
            <Link href="/analises#nova" className="button"><Icon name="plus" /> Nova análise</Link>
          </>
        }
      />
      <div className="page-body">
        <section className="tiles" aria-label="Resumo">
          <Link href="/analises?filtro=revisar" className="tile">
            <span className="eyebrow">Análises a revisar</span>
            <strong className={`tile-value${paraRevisar.length ? " is-alert" : ""}`}>{paraRevisar.length}</strong>
            <span className="muted small">vínculos pendentes ou dados faltando</span>
          </Link>
          <Link href="/analises?filtro=calcular" className="tile">
            <span className="eyebrow">Prontas para calcular</span>
            <strong className="tile-value">{paraCalcular.length}</strong>
            <span className="muted small">incluindo cálculos desatualizados</span>
          </Link>
          <Link href="/processos" className="tile">
            <span className="eyebrow">Processos ativos</span>
            <strong className="tile-value">{ativos.length}</strong>
            <span className="muted small">de {processos.length} no quadro</span>
          </Link>
          <a href="#alertas" className="tile">
            <span className="eyebrow">Aposentam em {HORIZONTE_MESES} meses</span>
            <strong className={`tile-value${alertas.some((x) => x.kind === "JA") ? " is-alert" : ""}`}>{alertas.length}</strong>
            <span className="muted small">{alertas.filter((x) => x.kind === "JA").length} já podem pedir o benefício</span>
          </a>
          <Link href="/processos?filtro=recentes" className="tile">
            <span className="eyebrow">Movimentaram em 7 dias</span>
            <strong className="tile-value">{movimentaram.length}</strong>
            <span className="muted small">processos com andamento novo</span>
          </Link>
        </section>

        <section className="card" id="alertas">
          <div className="card-header">
            <h2 className="card-title"><Icon name="alert" /> Alertas de aposentadoria</h2>
            <span className="muted small">clientes que atingem uma regra nos próximos {HORIZONTE_MESES} meses, pelo último cálculo de cada um</span>
          </div>
          {alertas.length === 0 ? (
            <div className="empty">
              <strong>Nenhum cliente perto de se aposentar</strong>
              <span>{analyses.some((a) => a.baseRun) ? `Nenhum cálculo projeta elegibilidade nos próximos ${HORIZONTE_MESES} meses.` : "Calcule os cenários de um cliente para acompanhar a data aqui."}</span>
            </div>
          ) : (
            <div className="scroll-x">
              <table className="table">
                <thead><tr><th>Cliente</th><th>Regra</th><th>Data projetada</th><th>Situação</th><th></th></tr></thead>
                <tbody>
                  {alertas.map((x) => (
                    <tr key={x.analysisId}>
                      <td><Link className="row-link" href={`/analises/${x.analysisId}`}>{x.clientLabel}</Link></td>
                      <td>{x.ruleName}</td>
                      <td className="tabular nowrap">{brDate(x.data)}</td>
                      <td>{x.kind === "JA" ? <Badge tone="ok">Já pode pedir</Badge> : <Badge tone={x.meses <= 6 ? "warn" : "info"}>{waitText(hoje, x.data)}</Badge>}</td>
                      <td className="nowrap"><Link href={`/analises/${x.analysisId}/cenarios/${x.runId}`} className="button button-ghost button-sm">Ver cenários</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="two-col" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", alignItems: "start" }}>
          <section className="card">
            <div className="card-header">
              <h2 className="card-title"><Icon name="calc" /> Continue de onde parou</h2>
              <Link href="/analises" className="small">Ver todas</Link>
            </div>
            {pendentes.length === 0 ? (
              <div className="empty">
                <strong>Nada pendente</strong>
                <span>{analyses.length ? "Todos os cálculos estão em dia." : "Envie o primeiro CNIS para começar."}</span>
                {!analyses.length && <Link href="/analises#nova" className="button button-sm">Nova análise</Link>}
              </div>
            ) : (
              <div className="scroll-x">
                <table className="table">
                  <thead><tr><th>Cliente</th><th>Próximo passo</th><th>Atualizada</th></tr></thead>
                  <tbody>
                    {pendentes.map((a) => (
                      <tr key={a.id}>
                        <td><Link className="row-link" href={a.next.step === "REVISAR" ? `/analises/${a.id}?ver=atencao` : `/analises/${a.id}`}>{a.clientLabel}</Link></td>
                        <td><Badge tone={a.next.tone}>{a.next.label}</Badge></td>
                        <td className="muted nowrap">{dateTime.format(a.atualizadaEm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <h2 className="card-title"><Icon name="clock" /> Movimentações recentes</h2>
              <Link href="/processos" className="small">Abrir quadro</Link>
            </div>
            {feed.length === 0 ? (
              <div className="empty">
                <strong>Nenhum processo acompanhado</strong>
                <span>Importe processos pelo número CNJ para ver os andamentos aqui.</span>
                <Link href="/processos#importar" className="button button-sm">Importar processo</Link>
              </div>
            ) : (
              <ul className="feed">
                {feed.map((m) => (
                  <li key={`${m.processoId}-${m.data}-${m.titulo}`}>
                    <span className="when" title={brDate(m.data)}>{daysAgo(m.data, hoje)}</span>
                    <span className="what">
                      <Link href={`/processos/${m.processoId}`}>{m.titulo}</Link>
                      <span className="muted small"><span className="mono">{m.numeroCnj}</span>{m.clientLabel ? ` · ${m.clientLabel}` : ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {processos.length > 0 && (
          <section className="card">
            <div className="card-header">
              <h2 className="card-title"><Icon name="board" /> Processos por etapa</h2>
              <Link href="/processos" className="small">Abrir quadro</Link>
            </div>
            <div className="card-body">
              <div className="tiles">
                {STAGES.map((s) => (
                  <Link key={s.id} href={`/processos#col-${s.id}`} className="tile">
                    <span className={`row stage-${s.id}`} style={{ gap: 6 }}><span className="dot" aria-hidden="true" /><span className="eyebrow" style={{ color: "inherit" }}>{s.label}</span></span>
                    <strong className="tile-value">{processos.filter((p) => p.stage === s.id).length}</strong>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
