import Link from "next/link";
import { notFound } from "next/navigation";
import { brDate } from "@/format";
import type { Resultado, RuleVersion, TrailNode } from "@/scenarios/evaluate";
import { earliest, humanize, inDisplayOrder, paramValue, requirementText, RMI_RESSALVA, rmiBasis, rmiValue, verdict } from "@/scenarios/present";
import { loadRunView } from "@/scenarios/store";
import { ReexecutarButton } from "../buttons";

export default async function ScenariosPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params;
  const view = await loadRunView(Number(id), Number(runId));
  if (!view) notFound();
  const { run, analysis, versions } = view;
  const first = earliest(run.result);
  const reportUrl = `/analises/${analysis.id}/cenarios/${run.id}/relatorio`;

  return (
    <>
      <p className="muted"><Link href={`/analises/${analysis.id}`}>← Revisão da linha do tempo</Link></p>
      <section className="hero">
        <h1 className="display">
          {analysis.clientLabel}
          <em>cenários em {brDate(run.referenceDate)}.</em>
        </h1>
        <p className="lede">
          Elegibilidade hoje e data projetada supondo contribuição contínua a partir de hoje. Clique em qualquer número para ver de onde ele vem.
        </p>
      </section>

      <div className="stack-lg">
        {first && (
          <p className="highlight">
            Regra atingida mais cedo: <strong>{first.nome}</strong>, {verdict(first).text.toLowerCase()}.{" "}
            <span className="muted">
              {run.result.some((r) => r.rmi)
                ? "Mais cedo não quer dizer mais vantajoso: compare também o valor estimado de cada regra."
                : "Mais cedo não quer dizer mais vantajoso: este cálculo não estimou o valor do benefício."}
            </span>
          </p>
        )}
        <div className="toolbar">
          <ReexecutarButton runId={run.id} />
          <a className="button button-quiet" href={reportUrl} target="_blank" rel="noopener">Abrir relatório</a>
          <a className="button button-quiet" href={`${reportUrl}?download`}>Baixar .html</a>
        </div>
        <div className="scenarios">
          {inDisplayOrder(run.result).map((r) => (
            <Scenario key={r.ruleCode} r={r} trail={run.trail[r.ruleCode]} rmiTrail={run.trail.EC103_ART26_RMI} version={versions.get(r.ruleVersionId)} analysisId={analysis.id} />
          ))}
        </div>
        <p className="muted small">
          Cálculo nº {run.id}. Guarda os insumos e as versões de regra usadas, por isso pode ser reexecutado com resultado idêntico. Parâmetros das regras são premissas do
          projeto a partir da EC 103/2019 [VALIDAR]; não é aconselhamento jurídico.
        </p>
      </div>
    </>
  );
}

function Scenario({ r, trail, rmiTrail, version, analysisId }: { r: Resultado; trail?: TrailNode; rmiTrail?: TrailNode; version?: RuleVersion; analysisId: number }) {
  const v = verdict(r);
  return (
    <section className={`card scenario is-${v.kind}`}>
      <p className="eyebrow">{r.legalBasis} · v{r.version}</p>
      <h2 className="scenario-title">{r.nome}</h2>
      <p className="scenario-verdict">{v.text}</p>
      {r.motivo && <p className="muted small">{r.motivo}</p>}
      <ul className="requisitos">
        {r.requisitos.map((q, i) => {
          const node = trail?.children?.[i]?.label === q.label ? trail.children[i] : undefined;
          const param = version ? paramValue(version.parameters, q.param) : undefined;
          return (
            <li key={q.id} className={q.atendido ? "ok" : "falta"}>
              <span aria-hidden="true">{q.atendido ? "✓" : "✗"}</span>
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
                  <a href={`/analises/${analysisId}#edit-${e}`}>edição nº {e}</a>
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
