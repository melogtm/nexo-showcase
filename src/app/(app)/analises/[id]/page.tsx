import Link from "next/link";
import { notFound } from "next/navigation";
import type { Field, RawVinculo } from "@/cnis/parse";
import { brDate, brMonth } from "@/format";
import { getAnalysis } from "@/ingestion/ingest";

const show = (f: Field<string> | undefined, format: (s: string) => string = (s) => s) => (f?.value ? format(f.value) : "—");
const where = (f: { source: { page: number; line: number } }) => `p. ${f.source.page}, l. ${f.source.line}`;

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const analysis = Number.isSafeInteger(id) ? await getAnalysis(id) : undefined;
  if (!analysis) notFound();
  const { extraction } = analysis;

  return (
    <>
      <p className="muted"><Link href="/">← Análises</Link></p>
      <section className="hero">
        <h1 className="display">
          {analysis.clientLabel}
          <em>linha do tempo extraída.</em>
        </h1>
        {extraction && (
          <p className="lede">
            {show(extraction.filiado.nome)} · NIT {show(extraction.filiado.nit)} · nascimento {show(extraction.filiado.dataNascimento, brDate)}
          </p>
        )}
      </section>

      {!extraction ? (
        <p className="muted">Esta análise foi enviada antes da leitura automática do CNIS.</p>
      ) : (
        <div className="stack-lg">
          <section className="card">
            <h2 className="eyebrow">Vínculos ({extraction.vinculos.length})</h2>
            <table>
              <thead>
                <tr><th>Seq.</th><th>Origem</th><th>Início</th><th>Fim</th><th>Tipo</th><th>Indicadores</th><th>Competências</th><th>Origem no PDF</th></tr>
              </thead>
              <tbody>
                {extraction.vinculos.map((v) => (
                  <VinculoRow key={`${v.source.page}-${v.source.line}`} v={v} />
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2 className="eyebrow">Trechos não reconhecidos ({extraction.unparsed.length})</h2>
            {extraction.unparsed.length === 0 ? (
              <p className="muted">Todo o texto do PDF foi reconhecido.</p>
            ) : (
              <>
                <p className="muted">O Nexo não entendeu estes trechos. Confira no PDF antes de confiar na linha do tempo.</p>
                <ul className="fragments">
                  {extraction.unparsed.map((u) => (
                    <li key={`${u.page}-${u.line}-${u.rawText}`}>
                      <span className="muted">p. {u.page}, l. {u.line}</span> <code>{u.rawText}</code>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <p className="muted small">Leitura feita pelo parser v{analysis.parserVersion}.</p>
        </div>
      )}
    </>
  );
}

function VinculoRow({ v }: { v: RawVinculo }) {
  const competencias = v.remuneracoes.length + v.contribuicoes.length;
  return (
    <>
      <tr>
        <td>{v.seq.value}</td>
        <td>{show(v.origem)}{v.especie?.value && <div className="muted small">{v.especie.value}</div>}</td>
        <td>{show(v.dataInicio, brDate)}</td>
        <td>{v.dataFim?.value ? brDate(v.dataFim.value) : <span className="badge">Sem data fim</span>}</td>
        <td>{v.tipo === "BENEFICIO" ? "Benefício" : show(v.tipoFiliado)}</td>
        <td>{v.indicadores?.value?.join(", ") || "—"}</td>
        <td>{competencias ? `${competencias} (${brMonth(firstCompetencia(v))} a ${brMonth(lastCompetencia(v))})` : "—"}</td>
        <td className="muted small">{where(v.seq)}</td>
      </tr>
      {v.problems.length > 0 && (
        <tr className="problem-row">
          <td />
          <td colSpan={7}>
            {v.problems.map((p) => (
              <div key={p} className="error small">⚠ {p}</div>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}

const competencias = (v: RawVinculo) => [...v.remuneracoes, ...v.contribuicoes].map((r) => r.competencia.value ?? "").sort();
const firstCompetencia = (v: RawVinculo) => competencias(v)[0];
const lastCompetencia = (v: RawVinculo) => competencias(v).at(-1)!;
