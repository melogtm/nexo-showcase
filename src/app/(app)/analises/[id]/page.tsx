import Link from "next/link";
import { notFound } from "next/navigation";
import { brDate, brDuracao, brMonth, brNumber } from "@/format";
import { loadReview } from "@/timeline/review";
import type { Periodo, Status } from "@/timeline/timeline";
import { saveSexo } from "./actions";
import { ChartLegend, TimelineChart } from "./timeline-chart";
import { VinculoEditor } from "./vinculo-editor";

const STATUS: Record<Status, { label: string; icon: string }> = {
  OK: { label: "OK", icon: "✓" },
  PENDENTE: { label: "Pendente", icon: "⏸" },
  REVISAR: { label: "Revisar", icon: "⚠" },
  EXCLUIDO: { label: "Excluído", icon: "✕" },
};
const FIELD_LABEL: Record<string, string> = { dataInicio: "Início", dataFim: "Fim", decisao: "Decisão", sexo: "Sexo" };
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const showValue = (field: string, v: string | null) =>
  !v ? "—" : field.startsWith("data") ? brDate(v) : ({ CONFIRMAR: "Confirmado", EXCLUIR: "Excluído", F: "Feminino", M: "Masculino" } as Record<string, string>)[v] ?? v;

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const review = Number.isSafeInteger(id) ? await loadReview(id) : undefined;
  if (!review) notFound();
  const { analysis, edits, timeline } = review;
  const extraction = analysis.extraction;
  const labelOf = (target: string) => {
    const p = timeline?.periodos.find((x) => x.key === target);
    return p ? `Vínculo ${p.seq ?? "?"}` : "Cliente";
  };

  return (
    <>
      <p className="muted"><Link href="/">← Análises</Link></p>
      <section className="hero">
        <h1 className="display">
          {analysis.clientLabel}
          <em>revisão da linha do tempo.</em>
        </h1>
        {extraction && (
          <p className="lede">
            {extraction.filiado.nome?.value ?? "—"} · NIT {extraction.filiado.nit?.value ?? "—"} · nascimento{" "}
            {extraction.filiado.dataNascimento?.value ? brDate(extraction.filiado.dataNascimento.value) : "—"}
          </p>
        )}
      </section>

      {!extraction || !timeline ? (
        <p className="muted">Esta análise foi enviada antes da leitura automática do CNIS.</p>
      ) : (
        <div className="stack-lg">
          <section className="tiles" aria-label="Resumo">
            <div className="tile">
              <span className="eyebrow">Tempo contado</span>
              <strong className="tile-value">{brDuracao(timeline.tempo.dias)}</strong>
              <span className="muted small">{brNumber(timeline.tempo.dias)} dias · só períodos OK</span>
            </div>
            <div className="tile">
              <span className="eyebrow">Em análise</span>
              <strong className="tile-value">{brDuracao(timeline.tempoEmAnalise.dias)}</strong>
              <span className="muted small">{brNumber(timeline.tempoEmAnalise.dias)} dias pendentes ou a revisar</span>
            </div>
            <div className="tile">
              <span className="eyebrow">Carência</span>
              <strong className="tile-value">{timeline.carencia.meses} meses</strong>
              <span className="muted small">competências válidas, sem repetição</span>
            </div>
            <div className="tile">
              <span className="eyebrow">Atenção</span>
              <strong className="tile-value">{timeline.periodos.filter((p) => p.status === "PENDENTE" || p.status === "REVISAR").length} vínculos</strong>
              <span className="muted small">{timeline.lacunas.length} lacunas · {timeline.concomitancias.length} concomitâncias · {extraction.unparsed.length} trechos não lidos</span>
            </div>
          </section>

          <form action={saveSexo.bind(null, analysis.id)} className="card inline-form">
            <label>
              Sexo do segurado <span className="muted">(o CNIS não informa de forma confiável; necessário para os cenários)</span>
              <select name="sexo" defaultValue={timeline.sexo ?? ""} required>
                <option value="" disabled>Selecione</option>
                <option value="F">Feminino</option>
                <option value="M">Masculino</option>
              </select>
            </label>
            <button type="submit" className="button button-quiet">Salvar</button>
          </form>

          <section className="card">
            <h2 className="eyebrow">Linha do tempo</h2>
            <ChartLegend />
            <TimelineChart timeline={timeline} />
            <p className="muted small">Duração em anos/meses/dias por convenção de exibição (365/30 dias); os cálculos usam dias.</p>
          </section>

          <section className="card">
            <h2 className="eyebrow">Vínculos ({timeline.periodos.length})</h2>
            <ol className="periodos">
              {timeline.periodos.map((p) => (
                <PeriodoItem key={p.key} analysisId={analysis.id} p={p} />
              ))}
            </ol>
          </section>

          {(timeline.lacunas.length > 0 || timeline.concomitancias.length > 0) && (
            <section className="card two-col">
              <div>
                <h2 className="eyebrow">Lacunas ({timeline.lacunas.length})</h2>
                <ul className="plain">
                  {timeline.lacunas.map((g) => <li key={g.inicio}>{brDate(g.inicio)} a {brDate(g.fim)} <span className="muted">· {brNumber(g.dias)} dias</span></li>)}
                </ul>
              </div>
              <div>
                <h2 className="eyebrow">Concomitâncias ({timeline.concomitancias.length})</h2>
                <ul className="plain">
                  {timeline.concomitancias.map((c) => (
                    <li key={`${c.a}-${c.b}-${c.inicio}`}>
                      {labelOf(c.a)} × {labelOf(c.b)}: {brDate(c.inicio)} a {brDate(c.fim)} <span className="muted">· {brNumber(c.dias)} dias, contados uma vez</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <section className="card">
            <h2 className="eyebrow">Trechos não reconhecidos ({extraction.unparsed.length})</h2>
            {extraction.unparsed.length === 0 ? (
              <p className="muted">Todo o texto do PDF foi reconhecido.</p>
            ) : (
              <>
                <p className="muted">O Nexo não entendeu estes trechos. Confira no PDF antes de confiar na linha do tempo.</p>
                <ul className="fragments">
                  {extraction.unparsed.map((u) => (
                    <li key={`${u.page}-${u.line}-${u.rawText}`}><span className="muted">p. {u.page}, l. {u.line}</span> <code>{u.rawText}</code></li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="card">
            <h2 className="eyebrow">Histórico de alterações ({edits.length})</h2>
            {edits.length === 0 ? (
              <p className="muted">Nenhuma alteração. A linha do tempo reflete exatamente o CNIS.</p>
            ) : (
              <table>
                <thead><tr><th>Quando</th><th>Quem</th><th>Onde</th><th>Campo</th><th>Antes</th><th>Depois</th><th>Justificativa</th></tr></thead>
                <tbody>
                  {edits.map((e) => (
                    <tr key={e.id}>
                      <td>{dateTime.format(e.editedAt)}</td>
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
            )}
          </section>
          <p className="muted small">Leitura feita pelo parser v{analysis.parserVersion}. O extrato original nunca é alterado; as edições acima são aplicadas por cima dele.</p>
        </div>
      )}
    </>
  );
}

function PeriodoItem({ analysisId, p }: { analysisId: number; p: Periodo }) {
  const s = STATUS[p.status];
  const comps = p.competencias.map((c) => c.competencia).sort();
  const compsProblem = p.competencias.filter((c) => c.status !== "OK");
  return (
    <li className={`periodo is-${p.status.toLowerCase()}`}>
      <div className="periodo-head">
        <span className={`badge status-${p.status.toLowerCase()}`}>{s.icon} {s.label}{p.confirmado && " · confirmado"}</span>
        <strong>{p.seq ?? "?"} · {p.origem ?? "—"}</strong>
        <span className="muted small">{p.tipo === "BENEFICIO" ? "Benefício" : p.tipo === "CONTRIBUINTE" ? "Contribuinte" : "Empregado"} · p. {p.source.page}, l. {p.source.line}</span>
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
      <details>
        <summary>Revisar este vínculo</summary>
        <VinculoEditor analysisId={analysisId} periodo={p} />
      </details>
    </li>
  );
}
