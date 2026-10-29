import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { brDate, brMoney } from "@/format";
import { listAnalyses } from "@/ingestion/ingest";
import { today } from "@/processos/provider";
import { STAGES, classify, stageLabel } from "@/processos/stages";
import { getProcesso, listEventos } from "@/processos/store";
import { Badge, Icon, PageHeader, daysAgo } from "../../ui";
import { moverComMotivo, retomarAutomatico, vincular } from "../actions";
import { SyncButton } from "./sync-button";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function ProcessoPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const id = Number((await params).id);
  const [p, eventos, analyses] = await Promise.all([getProcesso(id), Number.isSafeInteger(id) ? listEventos(id) : [], listAnalyses()]);
  if (!p) notFound();
  const s = p.snapshot;
  const auto = classify(s);
  const hoje = today();
  const analysis = analyses.find((a) => a.id === p.analysisId);
  const keyMov = auto.movimento ? `${auto.movimento.data}|${auto.movimento.titulo}` : null;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/", label: "Painel" }, { href: "/processos", label: "Processos" }]}
        title={<span className="mono" style={{ fontSize: 18 }}>{p.numeroCnj}</span>}
        sub={`${s.assunto ?? s.classe ?? "Processo"}${p.clientLabel || analysis ? ` · ${p.clientLabel ?? analysis?.clientLabel}` : ""}`}
        actions={
          <>
            <SyncButton id={p.id} />
            {p.analysisId && <Link href={`/analises/${p.analysisId}`} className="button"><Icon name="calc" /> Abrir cálculo</Link>}
          </>
        }
      />
      <div className="page-body">
        {s.fonte === "DEMO" && (
          <p className="notice warn"><Icon name="info" /> <span>Dados de demonstração, gerados a partir do número. Configure o token do Jusbrasil para ver o processo real.</span></p>
        )}
        <div className="split">
          <div className="stack-lg">
            <section className="card">
              <div className="card-header"><h2 className="card-title">Dados do processo</h2><span className="muted small">sincronizado {dateTime.format(p.sincronizadoEm)}</span></div>
              <div className="card-body">
                <dl className="meta-grid">
                  <div><dt>Classe</dt><dd>{s.classe ?? "—"}</dd></div>
                  <div><dt>Assunto</dt><dd>{s.assunto ?? "—"}</dd></div>
                  <div><dt>Tribunal</dt><dd>{s.tribunal ?? "—"}{s.uf ? ` · ${s.uf}` : ""}</dd></div>
                  <div><dt>Órgão</dt><dd>{s.orgao ?? "—"}{s.comarca ? ` · ${s.comarca}` : ""}</dd></div>
                  <div><dt>Distribuição</dt><dd>{s.distribuidoEm ? brDate(s.distribuidoEm) : "—"}</dd></div>
                  <div><dt>Valor da causa</dt><dd className="tabular">{s.valorCausaCentavos !== null ? `R$ ${brMoney(s.valorCausaCentavos)}` : "—"}</dd></div>
                  <div><dt>Situação na fonte</dt><dd>{s.situacao ?? "—"}</dd></div>
                  <div><dt>Juiz</dt><dd>{s.juiz ?? "—"}</dd></div>
                </dl>
                {s.partes.length > 0 && (
                  <div className="stack" style={{ gap: 6 }}>
                    <p className="eyebrow">Partes</p>
                    <ul className="plain">
                      {s.partes.map((x) => <li key={`${x.nome}-${x.polo}`}>{x.polo && <Badge>{x.polo}</Badge>} {x.nome}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </section>

            <section className="card">
              <div className="card-header"><h2 className="card-title">Movimentações ({s.movimentos.length})</h2><span className="muted small">mais recentes primeiro</span></div>
              {s.movimentos.length === 0 ? (
                <div className="empty"><span>Nenhuma movimentação na fonte.</span></div>
              ) : (
                <ol className="vtimeline">
                  {s.movimentos.map((m) => {
                    const isKey = `${m.data}|${m.titulo}` === keyMov;
                    return (
                      <li key={`${m.data}-${m.titulo}`} className={isKey ? "is-key" : undefined}>
                        <span className="when">{brDate(m.data)} · {daysAgo(m.data, hoje)}</span>
                        <strong>{m.titulo}</strong>
                        {m.descricao && <span className="muted">{m.descricao}</span>}
                        {isKey && <span className="small" style={{ color: "var(--red)" }}>Esta movimentação define a etapa automática: {stageLabel(auto.stage)}</span>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          <aside>
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Etapa</h2>
                <span className={`row stage-${p.stage}`} style={{ gap: 6, fontWeight: 600 }}><span className="dot" aria-hidden="true" />{stageLabel(p.stage)}</span>
              </div>
              <div className="card-body">
                <p className="small">
                  {p.stageOrigem === "MANUAL" ? <Badge>Definida manualmente</Badge> : <Badge tone="info">Automática</Badge>}{" "}
                  <span className="muted">{p.stageMotivo}</span>
                </p>
                {p.stageOrigem === "MANUAL" && (
                  <>
                    <p className="muted small">
                      Pelas movimentações, estaria em <strong>{stageLabel(auto.stage)}</strong>. Uma movimentação mais nova que a sua alteração volta o card para o automático.
                    </p>
                    <form action={retomarAutomatico.bind(null, p.id)}>
                      <button type="submit" className="button button-ghost button-sm"><Icon name="refresh" /> Voltar ao automático</button>
                    </form>
                  </>
                )}
                <form action={moverComMotivo.bind(null, p.id)} className="stack" style={{ gap: 8 }}>
                  <label>
                    Mover para
                    <select name="stage" defaultValue={p.stage}>
                      {STAGES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Motivo <span className="hint">(opcional, fica no histórico)</span>
                    <input name="motivo" maxLength={500} placeholder="Ex.: audiência marcada por telefone" />
                  </label>
                  <button type="submit" className="button button-secondary">Salvar etapa</button>
                </form>
              </div>
            </section>

            <section className="card">
              <div className="card-header"><h2 className="card-title"><Icon name="link" /> Cliente e cálculo</h2></div>
              <form action={vincular.bind(null, p.id)} className="card-body">
                <label>
                  Análise vinculada
                  <select name="analysisId" defaultValue={p.analysisId ?? ""}>
                    <option value="">Nenhuma</option>
                    {analyses.map((a) => <option key={a.id} value={a.id}>{a.clientLabel}</option>)}
                  </select>
                </label>
                <label>
                  Cliente
                  <input name="clientLabel" maxLength={200} defaultValue={p.clientLabel ?? ""} />
                </label>
                <button type="submit" className="button button-secondary">Salvar vínculo</button>
              </form>
            </section>

            <section className="card">
              <div className="card-header"><h2 className="card-title">Histórico no quadro</h2></div>
              <ul className="feed">
                {eventos.map((e) => (
                  <li key={e.id} style={{ gridTemplateColumns: "1fr", padding: "10px 18px" }}>
                    <span className="what">
                      <span>
                        {e.tipo === "IMPORTADO" ? "Importado" : e.tipo === "SINCRONIZADO" ? "Sincronizado" : `${e.de ? stageLabel(e.de) : "—"} → ${e.para ? stageLabel(e.para) : "—"}`}{" "}
                        <Badge tone={e.origem === "MANUAL" ? "neutral" : "info"}>{e.origem === "MANUAL" ? `Manual${e.editedBy ? ` · ${e.editedBy}` : ""}` : "Automático"}</Badge>
                      </span>
                      {e.motivo && <span className="muted small">{e.motivo}</span>}
                      <span className="muted small">{dateTime.format(e.at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
