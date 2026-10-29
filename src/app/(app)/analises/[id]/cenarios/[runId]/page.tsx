import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { brDate } from "@/format";
import type { Resultado, RuleVersion, TrailNode } from "@/scenarios/evaluate";
import { bestValue, earliest, humanize, inDisplayOrder, paramValue, requirementText, RMI_RESSALVA, rmiBasis, rmiValue, verdict, waitText } from "@/scenarios/present";
import { latestBaseRuns, loadRunView } from "@/scenarios/store";
import { today } from "@/processos/provider";
import { listEdits } from "@/timeline/review";
import { Badge, Icon, PageHeader, type Tone } from "../../../../ui";
import { CalcularButton, ReexecutarButton } from "../buttons";
import { SimularForm } from "../simular-form";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const VERDICT_TONE: Record<ReturnType<typeof verdict>["kind"], Tone> = { yes: "ok", later: "warn", na: "neutral" };
const anchor = (code: string) => `regra-${code}`;

export default async function ScenariosPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  await connection();
  const { id, runId } = await params;
  const view = await loadRunView(Number(id), Number(runId));
  if (!view) notFound();
  const { run, analysis, versions } = view;
  const [edits, bases] = await Promise.all([listEdits(analysis.id), latestBaseRuns()]);
  const premissas = run.timelineSnapshot.premissas;
  const base = premissas ? bases.get(analysis.id) : undefined;
  const baseDate = new Map(base?.result.map((r) => [r.ruleCode, r.aplicavel ? r.dataProjetada : null]) ?? []);
  const stale = edits.some((e) => e.editedAt > run.createdAt);
  const first = earliest(run.result);
  const best = bestValue(run.result);
  const hoje = run.result.filter((r) => r.aplicavel && r.elegivelHoje);
  const ordered = inDisplayOrder(run.result);
  const reportUrl = `/analises/${analysis.id}/cenarios/${run.id}/relatorio`;
  const petitionUrl = (code: string) => `/analises/${analysis.id}/cenarios/${run.id}/peticao?regra=${code}`;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/", label: "Painel" }, { href: "/analises", label: "Análises" }, { href: `/analises/${analysis.id}`, label: analysis.clientLabel }]}
        title={premissas ? `Simulação de planejamento · nº ${run.id}` : `Cenários de aposentadoria · cálculo nº ${run.id}`}
        sub={`Referência ${brDate(run.referenceDate)} · calculado em ${dateTime.format(run.createdAt)} · ${premissas ? `projeção com contribuições só até ${brDate(premissas.contribuicaoAte)}` : "projeção supõe contribuição contínua a partir da referência"}`}
        actions={
          <>
            <ReexecutarButton runId={run.id} />
            <a className="button button-secondary" href={reportUrl} target="_blank" rel="noopener"><Icon name="external" /> Relatório</a>
            <a className="button button-secondary" href={`${reportUrl}?download`}><Icon name="download" /> .html</a>
          </>
        }
      />
      <div className="page-body">
        {premissas && (
          <div className="notice info" role="status">
            <Icon name="info" />
            <div>
              <strong>Premissa: o cliente contribui até {brDate(premissas.contribuicaoAte)} e depois para.</strong>
              <span className="muted">
                Depois dessa data, o tempo de contribuição e a carência param de crescer; a idade continua. {base ? <>Compare com o <Link href={`/analises/${analysis.id}/cenarios/${base.id}`}>cálculo nº {base.id}</Link>, com contribuição contínua.</> : "Ainda não há cálculo com contribuição contínua para comparar."}
              </span>
            </div>
          </div>
        )}
        {stale && (
          <div className="notice warn" role="status">
            <Icon name="alert" />
            <div>
              <strong>A linha do tempo mudou depois deste cálculo.</strong>
              <span className="muted">Este resultado continua reproduzível com os dados da época, mas não reflete as edições mais recentes.</span>
              <div style={{ marginTop: 6 }}><CalcularButton analysisId={analysis.id} label="Recalcular agora" /></div>
            </div>
          </div>
        )}

        <section className="highlights" aria-label="Destaques">
          <div className="highlight">
            <span className="eyebrow">Elegível hoje</span>
            <span className="v">{hoje.length ? hoje.map((r) => r.nome).join(", ") : "Nenhuma regra"}</span>
            <span className="muted small">{hoje.length ? "Pode pedir o benefício já." : "Veja abaixo quando cada regra é atingida."}</span>
          </div>
          <div className="highlight">
            <span className="eyebrow">Primeira regra atingida</span>
            <span className="v">{first ? first.nome : "—"}</span>
            <span className="muted small">{first ? `${verdict(first).text} · ${waitText(run.referenceDate, first.dataProjetada)}` : "Nenhuma regra atingida no horizonte."}</span>
          </div>
          <div className="highlight">
            <span className="eyebrow">Maior valor estimado</span>
            <span className="v">{best?.rmi ? `${rmiValue(best.rmi)} · ${best.nome}` : "—"}</span>
            <span className="muted small">{best ? `${verdict(best).text}. Mais cedo nem sempre é mais vantajoso.` : "Este cálculo não estimou o valor do benefício."}</span>
          </div>
        </section>

        <section className="card" id="comparativo">
          <div className="card-header">
            <h2 className="card-title">Comparativo das regras</h2>
            <span className="muted small">clique numa regra para ver requisitos e a origem de cada número</span>
          </div>
          <div className="scroll-x">
            <table className="table compare">
              <thead>
                <tr><th>Regra</th><th>Situação</th><th>Data</th>{base && <th>Com contribuição contínua</th>}<th>Espera</th><th className="num">Valor estimado</th><th>Requisitos</th><th></th></tr>
              </thead>
              <tbody>
                {ordered.map((r) => {
                  const v = verdict(r);
                  const met = r.requisitos.filter((q) => q.atendido).length;
                  return (
                    <tr key={r.ruleCode} className={`${r === first ? "is-best-date" : ""} ${r === best ? "is-best-value" : ""}`}>
                      <td>
                        <a className="row-link" href={`#${anchor(r.ruleCode)}`} style={{ color: "var(--ink)", fontWeight: 600, textDecoration: "none" }}>{r.nome}</a>
                        <div className="muted small">{r.legalBasis} · v{r.version}</div>
                        <div className="row" style={{ gap: 4, marginTop: 2 }}>
                          {r === first && <Badge tone="info">mais cedo</Badge>}
                          {r === best && <Badge tone="ok">maior valor</Badge>}
                        </div>
                      </td>
                      <td><Badge tone={VERDICT_TONE[v.kind]}>{v.kind === "yes" ? "Elegível hoje" : v.kind === "later" ? "Elegível no futuro" : v.text}</Badge></td>
                      <td className="nowrap tabular">{r.aplicavel && r.dataProjetada ? brDate(r.dataProjetada) : r.aplicavel ? "Não atinge" : "—"}</td>
                      {base && <td className="nowrap tabular muted">{compareText(baseDate.get(r.ruleCode) ?? null, r.aplicavel ? r.dataProjetada : null)}</td>}
                      <td className="nowrap">{r.aplicavel ? waitText(run.referenceDate, r.dataProjetada) : "—"}</td>
                      <td className="num nowrap">{r.rmi ? rmiValue(r.rmi) : "—"}</td>
                      <td className="nowrap">{r.requisitos.length ? `${met} de ${r.requisitos.length}` : "—"}</td>
                      <td className="nowrap">{r.aplicavel && <a href={petitionUrl(r.ruleCode)} target="_blank" rel="noopener" className="button button-ghost button-sm">Minuta</a>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card-footer"><p className="muted small">{RMI_RESSALVA}</p></div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title"><Icon name="clock" /> {premissas ? "Simular outra data" : "Planejamento: e se o cliente parar de contribuir?"}</h2>
          </div>
          <div className="card-body" style={{ maxWidth: 420 }}>
            <SimularForm analysisId={analysis.id} hoje={today()} defaultDate={premissas?.contribuicaoAte} />
          </div>
        </section>

        <div className="scenarios">
          {ordered.map((r) => (
            <Scenario key={r.ruleCode} r={r} trail={run.trail[r.ruleCode]} rmiTrail={run.trail.EC103_ART26_RMI} version={versions.get(r.ruleVersionId)} analysisId={analysis.id} petitionUrl={petitionUrl(r.ruleCode)} referencia={run.referenceDate} contribuicaoAte={premissas?.contribuicaoAte} />
          ))}
        </div>
        <p className="muted small">
          Cálculo nº {run.id}. Guarda os insumos e as versões de regra usadas, por isso pode ser reexecutado com resultado idêntico. Parâmetros das regras são premissas do
          projeto a partir da EC 103/2019 [VALIDAR]; não é aconselhamento jurídico. <Link href={`/analises/${analysis.id}`}>Voltar à revisão da linha do tempo</Link>.
        </p>
      </div>
    </>
  );
}

/** How the simulated date compares with continuous contribution. */
function compareText(continua: string | null, simulada: string | null) {
  if (!continua) return "—";
  if (!simulada) return `${brDate(continua)} · deixa de atingir`;
  if (simulada === continua) return `${brDate(continua)} · igual`;
  return `${brDate(continua)} · ${simulada > continua ? "adia" : "antecipa"}`;
}

function Scenario({ r, trail, rmiTrail, version, analysisId, petitionUrl, referencia, contribuicaoAte }: { r: Resultado; trail?: TrailNode; rmiTrail?: TrailNode; version?: RuleVersion; analysisId: number; petitionUrl: string; referencia: string; contribuicaoAte?: string }) {
  const v = verdict(r);
  return (
    <section className={`card scenario is-${v.kind}`} id={anchor(r.ruleCode)}>
      <div className="row-between">
        <p className="eyebrow">{r.legalBasis} · v{r.version}</p>
        <Badge tone={VERDICT_TONE[v.kind]}>{v.text}</Badge>
      </div>
      <h2 className="scenario-title">{r.nome}</h2>
      {r.aplicavel && r.dataProjetada && !r.elegivelHoje && <p className="muted small">{waitText(referencia, r.dataProjetada)}, {contribuicaoAte ? `com contribuições até ${brDate(contribuicaoAte)}` : "se contribuir sem interrupção"}.</p>}
      {r.motivo && <p className="muted small">{r.motivo}</p>}
      <ul className="requisitos">
        {r.requisitos.map((q, i) => {
          const node = trail?.children?.[i]?.label === q.label ? trail.children[i] : undefined;
          const param = version ? paramValue(version.parameters, q.param) : undefined;
          return (
            <li key={q.id} className={q.atendido ? "ok" : "falta"}>
              <span><Icon name={q.atendido ? "check" : "alert"} size={14} label={q.atendido ? "atendido" : "falta"} /></span>
              <div>
                <strong>{q.label}</strong>
                <details className="trail">
                  <summary>{requirementText(q)}</summary>
                  <p className="small muted">
                    Parâmetro <code>{q.param}</code>
                    {param !== undefined && typeof param !== "object" && <> = <strong>{String(param)}</strong></>} · {r.nome} v{r.version}
                  </p>
                  {node?.children && node.children.length > 0 && <TrailList nodes={node.children} analysisId={analysisId} />}
                </details>
              </div>
            </li>
          );
        })}
      </ul>
      {r.rmi && (
        <div className="rmi">
          <p className="eyebrow">Valor estimado (RMI)</p>
          <details className="trail">
            <summary>{rmiValue(r.rmi)}</summary>
            <p className="small muted">{rmiBasis(r.rmi)}. {RMI_RESSALVA}</p>
            {r.rmi.valorCentavos !== null && rmiTrail && <RmiTrail node={rmiTrail} analysisId={analysisId} />}
          </details>
        </div>
      )}
      {r.aplicavel && (
        <p className="small">
          <a href={petitionUrl} target="_blank" rel="noopener">Minuta de petição</a>
          {!r.elegivelHoje && <span className="muted"> · só para planejamento</span>}
        </p>
      )}
    </section>
  );
}

/** The salários list is long (one line per month since 07/1994), so it opens separately. */
function RmiTrail({ node, analysisId }: { node: TrailNode; analysisId: number }) {
  const [media, ...rest] = node.children ?? [];
  return (
    <div className="small">
      <p className="muted">{node.label} · {node.value}</p>
      {media && (
        <>
          <p>{media.label}: <strong>{humanize(media.value ?? "")}</strong></p>
          {rest.map((n) => <p key={n.label} className="muted">{n.label}: {humanize(n.value ?? "")}</p>)}
          <details className="trail">
            <summary>Ver salários corrigidos</summary>
            <TrailList nodes={media.children ?? []} analysisId={analysisId} />
          </details>
        </>
      )}
    </div>
  );
}

function TrailList({ nodes, analysisId }: { nodes: TrailNode[]; analysisId: number }) {
  return (
    <ul className="trail-list">
      {nodes.map((n) => (
        <li key={`${n.label}-${n.value}`}>
          <span>{humanize(n.label)}</span>
          {n.value && <span className="muted"> · {humanize(n.value)}</span>}
          {n.source && (
            <div className="small muted">
              CNIS p. {n.source.page}, l. {n.source.line}: <code>{n.source.rawText}</code>
            </div>
          )}
          {n.editIds && n.editIds.length > 0 && (
            <div className="small">
              Alterado por{" "}
              {n.editIds.map((e, i) => (
                <span key={e}>
                  {i > 0 && ", "}
                  {/* Plain <a>: a full navigation, so the history row becomes :target and is highlighted. */}
                  <a href={`/analises/${analysisId}?ver=todos#edit-${e}`}>edição nº {e}</a>
                </span>
              ))}
            </div>
          )}
          {n.children && n.children.length > 0 && <TrailList nodes={n.children} analysisId={analysisId} />}
        </li>
      ))}
    </ul>
  );
}
