import Link from "next/link";
import { connection } from "next/server";
import { brDate, brDuracao } from "@/format";
import { type AnalysisOverview, analysesOverview } from "@/scenarios/progress";
import { Badge, Icon, PageHeader } from "../ui";
import { UploadForm } from "../upload-form";

export const metadata = { title: "Análises · Nexo" };

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

const FILTERS: { id: string; label: string; match: (a: AnalysisOverview) => boolean }[] = [
  { id: "todas", label: "Todas", match: () => true },
  { id: "revisar", label: "A revisar", match: (a) => a.next.step === "REVISAR" || a.next.step === "DADOS" },
  { id: "calcular", label: "Para calcular", match: (a) => a.next.step === "CALCULAR" || a.next.step === "RECALCULAR" },
  { id: "prontas", label: "Calculadas", match: (a) => a.next.step === "PRONTO" },
];

export default async function AnalysesPage({ searchParams }: { searchParams: Promise<{ filtro?: string; q?: string }> }) {
  await connection();
  const { filtro = "todas", q = "" } = await searchParams;
  const all = await analysesOverview();
  const filter = FILTERS.find((f) => f.id === filtro) ?? FILTERS[0];
  const term = q.trim().toLowerCase();
  const rows = all.filter((a) => filter.match(a) && (!term || a.clientLabel.toLowerCase().includes(term)));
  const href = (id: string) => `/analises?filtro=${id}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PageHeader crumbs={[{ href: "/", label: "Painel" }]} title="Análises e cálculos" sub="Cada análise parte de um CNIS: revise a linha do tempo, informe os dados do segurado e calcule os cenários." />
      <div className="page-body">
        <div className="split">
          <section className="card">
            <div className="card-header" style={{ paddingBottom: 0, borderBottom: 0 }}>
              <nav className="tabs" aria-label="Filtrar análises" style={{ flex: 1 }}>
                {FILTERS.map((f) => (
                  <Link key={f.id} href={href(f.id)} aria-current={f.id === filter.id ? "page" : undefined}>
                    {f.label} <span className="badge">{all.filter(f.match).length}</span>
                  </Link>
                ))}
              </nav>
            </div>
            <div className="card-body" style={{ paddingBlock: 12 }}>
              <form className="search" role="search" action="/analises">
                <input type="hidden" name="filtro" value={filter.id} />
                <Icon name="search" />
                <input type="search" name="q" defaultValue={q} placeholder="Buscar cliente" aria-label="Buscar cliente" />
              </form>
            </div>
            {rows.length === 0 ? (
              <div className="empty">
                <strong>{all.length ? "Nenhuma análise neste filtro" : "Nenhuma análise ainda"}</strong>
                <span>{all.length ? "Troque o filtro ou a busca." : "Envie o CNIS do primeiro cliente no painel ao lado."}</span>
              </div>
            ) : (
              <div className="scroll-x">
                <table className="table">
                  <thead>
                    <tr><th>Cliente</th><th>Próximo passo</th><th className="num">Vínculos</th><th className="num">Tempo contado</th><th className="num">Carência</th><th>Primeira elegibilidade</th><th>Último cálculo</th><th className="num">Processos</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <Link className="row-link" href={`/analises/${a.id}`}>{a.clientLabel}</Link>
                          <div className="muted small">criada em {dateTime.format(a.createdAt)}</div>
                        </td>
                        <td><Badge tone={a.next.tone}>{a.next.label}</Badge></td>
                        <td className="num">{a.vinculos ?? "—"}{a.atencao > 0 && <span className="muted"> ({a.atencao} ⚠)</span>}</td>
                        <td className="num nowrap">{a.tempoDias !== null ? brDuracao(a.tempoDias) : "—"}</td>
                        <td className="num nowrap">{a.carenciaMeses !== null ? `${a.carenciaMeses} m` : "—"}</td>
                        <td className="nowrap">
                          {a.primeira ? <><span className="tabular">{brDate(a.primeira.data)}</span><div className="muted small">{a.primeira.ruleName}</div></> : <span className="muted">—</span>}
                        </td>
                        <td className="nowrap">
                          {a.ultimoCalculo ? <Link href={`/analises/${a.id}/cenarios/${a.ultimoCalculo.id}`}>nº {a.ultimoCalculo.id}</Link> : <span className="muted">—</span>}
                          {a.ultimoCalculo && <div className="muted small">{dateTime.format(a.ultimoCalculo.em)}</div>}
                        </td>
                        <td className="num">{a.processos || <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <aside>
            <UploadForm />
          </aside>
        </div>
      </div>
    </>
  );
}
