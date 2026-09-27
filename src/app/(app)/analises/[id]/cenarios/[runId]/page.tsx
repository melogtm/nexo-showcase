import Link from "next/link";
import { notFound } from "next/navigation";
import { brDate, brDuracao, brNumber } from "@/format";
import type { Requisito } from "@/rules/core";
import type { Resultado } from "@/scenarios/evaluate";
import { getRun } from "@/scenarios/store";
import { ReexecutarButton } from "../buttons";

const pontos = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function show(unidade: Requisito["unidade"], n: number) {
  if (unidade === "dias") return `${brDuracao(n)} (${brNumber(n)} dias)`;
  if (unidade === "meses") return `${n} meses`;
  if (unidade === "idadeMeses") return `${Math.floor(n / 12)} anos${n % 12 ? ` e ${n % 12} meses` : ""}`;
  return `${pontos.format(n)} pontos`;
}

export default async function ScenariosPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params;
  const run = Number.isSafeInteger(Number(runId)) ? await getRun(Number(runId)) : undefined;
  if (!run || run.analysisId !== Number(id)) notFound();

  return (
    <>
      <p className="muted"><Link href={`/analises/${run.analysisId}`}>← Revisão da linha do tempo</Link></p>
      <section className="hero">
        <h1 className="display">
          Cenários
          <em>em {brDate(run.referenceDate)}.</em>
        </h1>
        <p className="lede">Elegibilidade hoje e data projetada supondo contribuição contínua a partir de hoje. Cálculo nº {run.id}, com as versões de regra registradas.</p>
      </section>
      <div className="stack-lg">
        <ReexecutarButton runId={run.id} />
        <div className="scenarios">
          {run.result.map((r) => (
            <Scenario key={r.ruleCode} r={r} referencia={run.referenceDate} />
          ))}
        </div>
        <p className="muted small">Parâmetros das regras são premissas do projeto a partir da EC 103/2019 [VALIDAR]. Não é aconselhamento jurídico.</p>
      </div>
    </>
  );
}

function Scenario({ r, referencia }: { r: Resultado; referencia: string }) {
  const verdict = !r.aplicavel
    ? { cls: "is-na", text: "Não se aplica" }
    : r.elegivelHoje
      ? { cls: "is-yes", text: "Elegível hoje" }
      : r.dataProjetada
        ? { cls: "is-later", text: `Elegível em ${brDate(r.dataProjetada)}` }
        : { cls: "is-na", text: "Fora do horizonte de 60 anos" };
  return (
    <section className={`card scenario ${verdict.cls}`}>
      <p className="eyebrow">{r.legalBasis} · v{r.version}</p>
      <h2 className="scenario-title">{r.nome}</h2>
      <p className="scenario-verdict">{verdict.text}</p>
      {r.motivo && <p className="muted small">{r.motivo}</p>}
      {r.requisitos.length > 0 && (
        <ul className="requisitos">
          {r.requisitos.map((q) => (
            <li key={q.id} className={q.atendido ? "ok" : "falta"}>
              <span aria-hidden="true">{q.atendido ? "✓" : "✗"}</span>
              <div>
                <strong>{q.label}</strong>
                <div className="small">
                  {show(q.unidade, q.atual)} <span className="muted">de {show(q.unidade, q.exigido)} em {brDate(referencia)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
