import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { CnisExtraction, UnparsedFragment } from "@/cnis/parse";
import { STATUS, brDate, brDateTime, brDuracao, brMonth, brNumber, today } from "@/format";
import { type Stage, stageLabel } from "@/processos/stages";
import { processosOfAnalysis } from "@/processos/store";
import type { Premissas } from "@/scenarios/evaluate";
import { type NextStep, nextStep } from "@/scenarios/progress";
import { listRuns } from "@/scenarios/store";
import type { listEdits } from "@/timeline/review";
import { loadReview } from "@/timeline/review";
import { type ChecklistItem, buildChecklist } from "@/timeline/checklist";
import type { Periodo, Sexo, Status, Timeline } from "@/timeline/timeline";
import { Badge, Icon, PageHeader, type Tone } from "../../ui";
import { saveSexo } from "./actions";
import { CalcularButton } from "./cenarios/buttons";
import { SimularForm } from "./cenarios/simular-form";
import { ChartLegend, TimelineChart } from "./timeline-chart";
import { VinculoEditor } from "./vinculo-editor";

type Edit = Awaited<ReturnType<typeof listEdits>>[number];

const FIELD_LABEL: Record<string, string> = { dataInicio: "Início", dataFim: "Fim", decisao: "Decisão", sexo: "Sexo" };
const showValue = (field: string, v: string | null) =>
  !v ? "—" : field.startsWith("data") ? brDate(v) : ({ CONFIRMAR: "Confirmado", EXCLUIR: "Excluído", F: "Feminino", M: "Masculino" } as Record<string, string>)[v] ?? v;
const STATUS_TONE: Record<Status, Tone> = { OK: "ok", PENDENTE: "warn", REVISAR: "danger", EXCLUIDO: "neutral" };
const TIPO_LABEL: Record<string, string> = { BENEFICIO: "Benefício", CONTRIBUINTE: "Contribuinte" };
const SEXO_LABEL = { F: "Feminino", M: "Masculino" } as const;

const VIEWS = [
  { id: "todos", label: "Todos", match: () => true },
  { id: "atencao", label: "Precisam de atenção", match: (p: Periodo) => p.status === "PENDENTE" || p.status === "REVISAR" },
  { id: "ok", label: "OK", match: (p: Periodo) => p.status === "OK" },
  { id: "excluidos", label: "Excluídos", match: (p: Periodo) => p.status === "EXCLUIDO" },
] as const;

export default async function AnalysisPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ver?: string }> }) {
  await connection();
  const id = Number((await params).id);
  const { ver } = await searchParams;
  const [review, runs, processos] = Number.isSafeInteger(id) ? await Promise.all([loadReview(id), listRuns(id), processosOfAnalysis(id)]) : [undefined, [], []];
  if (!review) notFound();
  const { analysis, edits, timeline } = review;
  const extraction = analysis.extraction;
  const crumbs = [{ href: "/", label: "Painel" }, { href: "/analises", label: "Análises" }];

  if (!extraction || !timeline) {
    return (
      <>
        <PageHeader crumbs={crumbs} title={analysis.clientLabel} />
        <div className="page-body"><p className="notice warn">Esta análise foi enviada antes da leitura automática do CNIS.</p></div>
      </>
    );
  }

  const labelOf = (target: string) => {
    const p = timeline.periodos.find((x) => x.key === target);
    return p ? `Vínculo ${p.seq ?? "?"}` : "Cliente";
  };
  const atencao = timeline.periodos.filter((p) => p.status === "PENDENTE" || p.status === "REVISAR");
  const baseRuns = runs.filter((r) => !r.premissas);
  const simulations = runs.filter((r) => r.premissas);
  const lastRun = baseRuns[0];
  const checklist = buildChecklist(timeline, { unparsed: extraction.unparsed.length, nascimento: !!extraction.filiado.dataNascimento?.value });
  const lastEditAt = edits.at(-1)?.editedAt ?? null;
  const next = nextStep({ lido: true, atencao: atencao.length, sexo: !!timeline.sexo, nascimento: !!extraction.filiado.dataNascimento?.value, ultimoCalculoEm: lastRun?.createdAt ?? null, ultimaEdicaoEm: lastEditAt });
  const staleRun = (r: { createdAt: Date }) => !!lastEditAt && lastEditAt > r.createdAt;
  const canCalc = !!timeline.sexo && !!extraction.filiado.dataNascimento?.value;
  const f = extraction.filiado;

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        title={analysis.clientLabel}
        sub={filiadoLine(f)}
        actions={
          <>
            <Badge tone={next.tone}>{next.label}</Badge>
            {lastRun && <Link href={`/analises/${analysis.id}/cenarios/${lastRun.id}`} className="button button-secondary">Último cálculo</Link>}
          </>
        }
      />
      <div className="page-body">
        <Stepper analysisId={analysis.id} atencao={atencao.length} canCalc={canCalc} sexo={timeline.sexo} next={next.step} lastRun={lastRun && { id: lastRun.id, stale: staleRun(lastRun) }} />

        <div className="split">
          <div className="stack-lg">
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Linha do tempo</h2>
                <ChartLegend />
              </div>
              <div className="card-body">
                <TimelineChart timeline={timeline} />
                <p className="muted small">Duração em anos/meses/dias por convenção de exibição (365/30 dias); os cálculos usam dias.</p>
              </div>
            </section>

            <VinculosCard analysisId={analysis.id} periodos={timeline.periodos} ver={ver} />

            <Conferencia items={checklist} analysisId={analysis.id} />

            <Unparsed fragments={extraction.unparsed} />
            <GapsAndOverlaps timeline={timeline} labelOf={labelOf} />
            <History edits={edits} labelOf={labelOf} />
            <p className="muted small">Leitura feita pelo parser v{analysis.parserVersion}. O extrato original nunca é alterado; as edições são aplicadas por cima dele e ficam no histórico.</p>
          </div>

          <aside>
            <section className="card">
              <div className="card-header"><h2 className="card-title">Resumo</h2></div>
              <div className="card-body">
                <dl className="kv">
                  <dt>Tempo contado</dt><dd>{brDuracao(timeline.tempo.dias)}</dd>
                  <dt className="small">dias (só OK)</dt><dd className="small muted">{brNumber(timeline.tempo.dias)}</dd>
                  <dt>Em análise</dt><dd>{brDuracao(timeline.tempoEmAnalise.dias)}</dd>
                  <dt>Carência</dt><dd>{timeline.carencia.meses} meses</dd>
                  <dt>Lacunas</dt><dd>{timeline.lacunas.length}</dd>
                  <dt>Concomitâncias</dt><dd>{timeline.concomitancias.length}</dd>
                </dl>
              </div>
            </section>

            <BeforeCalc analysisId={analysis.id} atencao={atencao.length} unparsed={extraction.unparsed.length} nascimento={!!f.dataNascimento?.value} sexo={timeline.sexo} checklist={checklist.length} canCalc={canCalc} runs={baseRuns.slice(0, 5).map((r) => ({ id: r.id, createdAt: r.createdAt, stale: staleRun(r) }))} />
            <Planejamento analysisId={analysis.id} hoje={today()} canCalc={canCalc} simulations={simulations.slice(0, 5)} />
            <ProcessosCard processos={processos} />
          </aside>
        </div>
      </div>
    </>
  );
}

type StepState = "done" | "current" | "todo" | "blocked";

function VinculosCard({ analysisId, periodos, ver }: { analysisId: number; periodos: Periodo[]; ver?: string }) {
  const atencao = periodos.filter(VIEWS[1].match).length;
  const view = VIEWS.find((v) => v.id === ver) ?? (atencao ? VIEWS[1] : VIEWS[0]);
  const shown = periodos.filter(view.match);
  return (
    <section className="card" id="vinculos">
      <div className="card-header" style={{ paddingBottom: 0, borderBottom: 0 }}>
        <nav className="tabs" aria-label="Filtrar vínculos" style={{ flex: 1 }}>
          {VIEWS.map((v) => (
            <Link key={v.id} href={`/analises/${analysisId}?ver=${v.id}#vinculos`} aria-current={v.id === view.id ? "page" : undefined} scroll={false}>
              {v.label} <span className={`badge${v.id === "atencao" && atencao ? " tone-warn" : ""}`}>{periodos.filter(v.match).length}</span>
            </Link>
          ))}
        </nav>
      </div>
      {shown.length === 0 ? (
        <div className="empty">
          <strong>{view.id === "atencao" ? "Nada para revisar" : "Nenhum vínculo aqui"}</strong>
          {view.id === "atencao" && <span>Todos os vínculos estão OK ou foram decididos. Siga para os dados do segurado.</span>}
        </div>
      ) : (
        <ol className="periodos">
          {shown.map((p) => <PeriodoItem key={p.key} analysisId={analysisId} p={p} openEditor={view.id === "atencao"} />)}
        </ol>
      )}
    </section>
  );
}

const filiadoLine = (f: CnisExtraction["filiado"]) =>
  `${f.nome?.value ?? "—"} · NIT ${f.nit?.value ?? "—"} · nascimento ${f.dataNascimento?.value ? brDate(f.dataNascimento.value) : "—"}`;

type StepperInput = { analysisId: number; atencao: number; canCalc: boolean; sexo: Sexo | null; next: NextStep["step"]; lastRun?: { id: number; stale: boolean } };

/** The four steps of an analysis and where each one stands. */
function stepperSteps({ analysisId, atencao, canCalc, sexo, next, lastRun }: StepperInput): { state: StepState; href?: string; title: string; text: string }[] {
  const scenarios = lastRun && `/analises/${analysisId}/cenarios/${lastRun.id}`;
  return [
    { state: atencao ? "current" : "done", href: `/analises/${analysisId}?ver=atencao`, title: "Revisar vínculos", text: atencao ? `${atencao} precisam de atenção` : "Todos revisados" },
    { state: canCalc ? "done" : atencao ? "blocked" : "current", href: "#dados", title: "Dados do segurado", text: sexo ? `Sexo: ${SEXO_LABEL[sexo].toLowerCase()}` : "Informe o sexo" },
    {
      state: next === "PRONTO" ? "done" : next === "CALCULAR" || next === "RECALCULAR" ? "current" : "todo",
      href: scenarios ?? "#calcular",
      title: "Cenários",
      text: lastRun ? (lastRun.stale ? "Desatualizado: recalcule" : `Cálculo nº ${lastRun.id}`) : "Ainda não calculado",
    },
    { state: "todo", href: scenarios && `${scenarios}#comparativo`, title: "Relatório e petição", text: lastRun ? "Escolha a regra" : "Depois do cálculo" },
  ];
}

function Stepper(props: StepperInput) {
  return (
    <ol className="stepper card" aria-label="Etapas da análise">
      {stepperSteps(props).map((st, i) => <Step key={st.title} n={i + 1} {...st} />)}
    </ol>
  );
}

function BeforeCalc({ analysisId, atencao, unparsed, nascimento, sexo, checklist, canCalc, runs }: { analysisId: number; atencao: number; unparsed: number; nascimento: boolean; sexo: Sexo | null; checklist: number; canCalc: boolean; runs: { id: number; createdAt: Date; stale: boolean }[] }) {
  return (
    <section className="card accent" id="calcular">
      <div className="card-header"><h2 className="card-title">Antes de calcular</h2></div>
      <div className="card-body">
        <ul className="checklist">
          <Check ok={atencao === 0} warn text={atencao ? <><Link href={`/analises/${analysisId}?ver=atencao#vinculos`}>{atencao} vínculo(s)</Link> pendente(s) ou a revisar ficam fora da conta</> : "Todos os vínculos revisados"} />
          <Check ok={unparsed === 0} warn text={unparsed ? <><a href="#nao-lidos">{unparsed} trecho(s)</a> do PDF não reconhecido(s)</> : "Todo o PDF foi reconhecido"} />
          <Check ok={nascimento} text={nascimento ? "Data de nascimento lida do CNIS" : "Data de nascimento ausente no CNIS"} />
          <Check ok={!!sexo} text={sexo ? "Sexo do segurado informado" : "Informe o sexo do segurado"} />
          <Check ok={checklist === 0} warn text={checklist ? <><a href="#conferencia">{checklist} item(ns) de conferência</a> e documentos a pedir</> : "Nada a conferir com o cliente"} />
        </ul>
        <form action={saveSexo.bind(null, analysisId)} className="inline-form" id="dados">
          <label>
            Sexo do segurado <span className="hint">(o CNIS não informa de forma confiável)</span>
            <select name="sexo" defaultValue={sexo ?? ""} required>
              <option value="" disabled>Selecione</option>
              <option value="F">Feminino</option>
              <option value="M">Masculino</option>
            </select>
          </label>
          <button type="submit" className="button button-secondary">Salvar</button>
        </form>
        <CalcularButton analysisId={analysisId} block disabled={!canCalc} label={runs.length ? "Calcular novamente" : "Calcular cenários"} />
        <p className="muted small">Calcula as cinco regras da EC 103/2019 com a linha do tempo como está agora (só períodos OK). Cada cálculo fica registrado e pode ser reexecutado.</p>
      </div>
      {runs.length > 0 && (
        <div className="card-footer">
          <p className="eyebrow" style={{ marginBottom: 6 }}>Cálculos</p>
          <ul className="plain small">
            {runs.map((r) => (
              <li key={r.id} className="row-between">
                <Link href={`/analises/${analysisId}/cenarios/${r.id}`}>Cálculo nº {r.id}</Link>
                <span className="muted">{r.stale ? <Badge tone="warn">desatualizado</Badge> : brDateTime(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Planejamento({ analysisId, hoje, canCalc, simulations }: { analysisId: number; hoje: string; canCalc: boolean; simulations: { id: number; premissas: Premissas | null }[] }) {
  return (
    <section className="card" id="planejamento">
      <div className="card-header"><h2 className="card-title"><Icon name="clock" /> Planejamento</h2></div>
      <div className="card-body">
        <p className="muted small">E se o cliente parar de contribuir? Escolha a data: o Nexo refaz as cinco regras com essa premissa e mostra o que muda em relação ao cálculo com contribuição contínua.</p>
        <SimularForm analysisId={analysisId} hoje={hoje} disabled={!canCalc} />
      </div>
      {simulations.length > 0 && (
        <div className="card-footer">
          <p className="eyebrow" style={{ marginBottom: 6 }}>Simulações</p>
          <ul className="plain small">
            {simulations.map((r) => (
              <li key={r.id} className="row-between">
                <Link href={`/analises/${analysisId}/cenarios/${r.id}`}>Para em {r.premissas ? brDate(r.premissas.contribuicaoAte) : "—"}</Link>
                <span className="muted">nº {r.id}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ProcessosCard({ processos }: { processos: { id: number; numeroCnj: string; stage: Stage }[] }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title"><Icon name="board" /> Processos</h2>
        <Link href="/processos#importar" className="small">Importar</Link>
      </div>
      {processos.length === 0 ? (
        <div className="card-body"><p className="muted small">Nenhum processo vinculado a este cliente. Ao importar, escolha esta análise para ligar o processo ao cálculo.</p></div>
      ) : (
        <ul className="feed">
          {processos.map((p) => (
            <li key={p.id} style={{ gridTemplateColumns: "1fr" }}>
              <span className="what">
                <Link href={`/processos/${p.id}`} className="mono">{p.numeroCnj}</Link>
                <span className={`row small stage-${p.stage}`} style={{ gap: 6 }}><span className="dot" aria-hidden="true" />{stageLabel(p.stage)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Step({ n, state, href, title, text }: { n: number; state: StepState; href?: string; title: string; text: string }) {
  const body = (
    <>
      <span className="n">{state === "done" ? <Icon name="check" size={14} label="concluída" /> : n}</span>
      <span className="t"><strong>{title}</strong><span>{text}</span></span>
    </>
  );
  return (
    <li className={`is-${state}`} aria-current={state === "current" ? "step" : undefined}>
      {href ? <Link href={href}>{body}</Link> : <span className="step">{body}</span>}
    </li>
  );
}

function Check({ ok, warn = false, text }: { ok: boolean; warn?: boolean; text: React.ReactNode }) {
  return (
    <li>
      <span className={ok ? "ic-ok" : warn ? "ic-warn" : "ic-danger"}><Icon name={ok ? "check" : "alert"} label={ok ? "ok" : warn ? "atenção" : "falta"} /></span>
      <span>{text}</span>
    </li>
  );
}

function PeriodoItem({ analysisId, p, openEditor }: { analysisId: number; p: Periodo; openEditor: boolean }) {
  const s = STATUS[p.status];
  const comps = p.competencias.map((c) => c.competencia).sort();
  const compsProblem = p.competencias.filter((c) => c.status !== "OK");
  const needsReview = p.status === "REVISAR" || p.status === "PENDENTE";
  return (
    <li className={`periodo is-${p.status.toLowerCase()}`} id={p.key.replace(":", "-")}>
      <div className="periodo-head">
        <Badge tone={STATUS_TONE[p.status]}>{s.icon} {s.label}{p.confirmado && " · confirmado"}</Badge>
        <strong>{p.seq ?? "?"} · {p.origem ?? "—"}</strong>
        <span className="muted small">{TIPO_LABEL[p.tipo] ?? "Empregado"} · CNIS p. {p.source.page}, l. {p.source.line}</span>
      </div>
      <p className="periodo-dates">
        {p.inicio ? brDate(p.inicio) : "?"} a {p.fim ? brDate(p.fim) : "?"}
        {p.fimInferido && <span className="muted"> (fim inferido)</span>}
        {comps.length > 0 && <span className="muted"> · {comps.length} competências ({brMonth(comps[0])} a {brMonth(comps.at(-1)!)})</span>}
      </p>
      {(p.motivos.length > 0 || p.avisos.length > 0 || compsProblem.length > 0) && (
        <ul className="motivos">
          {p.motivos.map((m) => <li key={m}>⚠ {m}</li>)}
          {p.avisos.map((m) => <li key={m} className="aviso">ℹ {m}</li>)}
          {compsProblem.map((c) => <li key={c.competencia}>⚠ {brMonth(c.competencia)}: {c.motivos.join("; ")}</li>)}
        </ul>
      )}
      <details className="reveal" open={openEditor && needsReview}>
        <summary>{needsReview ? "Revisar este vínculo" : "Editar este vínculo"}</summary>
        <VinculoEditor analysisId={analysisId} periodo={p} />
      </details>
    </li>
  );
}

function Conferencia({ items, analysisId }: { items: ChecklistItem[]; analysisId: number }) {
  return (
    <section className="card" id="conferencia">
      <div className="card-header">
        <h2 className="card-title">Conferência e documentos {items.length > 0 ? <Badge tone="warn">{items.length}</Badge> : <Badge tone="ok">ok</Badge>}</h2>
        {items.length > 0 && (
          <a className="button button-secondary button-sm" href={`/analises/${analysisId}/documentos`} target="_blank" rel="noopener"><Icon name="external" /> Lista de documentos para o cliente</a>
        )}
      </div>
      {items.length === 0 ? (
        <div className="card-body"><p className="muted">Nada a conferir: todos os vínculos estão OK ou foram decididos, e o PDF foi lido por inteiro.</p></div>
      ) : (
        <ul className="checks">
          {items.map((i) => (
            <li key={i.id}>
              <span className={i.prioridade === "ALTA" ? "ic-danger" : "ic-warn"}><Icon name="alert" label={i.prioridade === "ALTA" ? "prioridade alta" : "prioridade média"} /></span>
              <div className="stack" style={{ gap: 4 }}>
                <span className="small muted">{i.anchor ? <a href={i.anchor}>{i.onde}</a> : i.onde}</span>
                <span>{i.problema}</span>
                <ul className="docs">{i.documentos.map((d) => <li key={d}>{d}</li>)}</ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GapsAndOverlaps({ timeline, labelOf }: { timeline: Timeline; labelOf: (target: string) => string }) {
  if (timeline.lacunas.length === 0 && timeline.concomitancias.length === 0) return null;
  return (
    <details className="card section">
      <summary>Lacunas ({timeline.lacunas.length}) e concomitâncias ({timeline.concomitancias.length})</summary>
      <div className="card-body two-col">
        <div className="stack" style={{ gap: 6 }}>
          <p className="eyebrow">Lacunas</p>
          <ul className="plain">
            {timeline.lacunas.map((g) => <li key={g.inicio}>{brDate(g.inicio)} a {brDate(g.fim)} <span className="muted">· {brNumber(g.dias)} dias</span></li>)}
            {timeline.lacunas.length === 0 && <li className="muted">Nenhuma</li>}
          </ul>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <p className="eyebrow">Concomitâncias</p>
          <ul className="plain">
            {timeline.concomitancias.map((c) => (
              <li key={`${c.a}-${c.b}-${c.inicio}`}>
                {labelOf(c.a)} × {labelOf(c.b)}: {brDate(c.inicio)} a {brDate(c.fim)} <span className="muted">· {brNumber(c.dias)} dias, contados uma vez</span>
              </li>
            ))}
            {timeline.concomitancias.length === 0 && <li className="muted">Nenhuma</li>}
          </ul>
        </div>
      </div>
    </details>
  );
}

function Unparsed({ fragments }: { fragments: UnparsedFragment[] }) {
  return (
    <details className="card section" id="nao-lidos" open={fragments.length > 0}>
      <summary>
        <span className="row">Trechos não reconhecidos {fragments.length > 0 ? <Badge tone="warn">{fragments.length}</Badge> : <Badge tone="ok">0</Badge>}</span>
      </summary>
      {fragments.length === 0 ? (
        <div className="card-body"><p className="muted">Todo o texto do PDF foi reconhecido.</p></div>
      ) : (
        <>
          <div className="card-body"><p className="muted">O Nexo não entendeu estes trechos. Confira no PDF antes de confiar na linha do tempo.</p></div>
          <ul className="fragments">
            {fragments.map((u) => (
              <li key={`${u.page}-${u.line}-${u.rawText}`}><span className="muted">p. {u.page}, l. {u.line}</span> <code>{u.rawText}</code></li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}

function History({ edits, labelOf }: { edits: Edit[]; labelOf: (target: string) => string }) {
  return (
    <details className="card section" id="historico">
      <summary>Histórico de alterações ({edits.length})</summary>
      {edits.length === 0 ? (
        <div className="card-body"><p className="muted">Nenhuma alteração. A linha do tempo reflete exatamente o CNIS.</p></div>
      ) : (
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>Quando</th><th>Quem</th><th>Onde</th><th>Campo</th><th>Antes</th><th>Depois</th><th>Justificativa</th></tr></thead>
            <tbody>
              {edits.map((e) => (
                <tr key={e.id} id={`edit-${e.id}`}>
                  <td className="nowrap">{brDateTime(e.editedAt)}</td>
                  <td>{e.editedBy}</td>
                  <td>{labelOf(e.target)}</td>
                  <td>{FIELD_LABEL[e.field] ?? e.field}</td>
                  <td>{showValue(e.field, e.oldValue)}</td>
                  <td>{showValue(e.field, e.newValue) === "—" ? "Reaberto" : showValue(e.field, e.newValue)}</td>
                  <td className="wrap">{e.justificativa ?? <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
