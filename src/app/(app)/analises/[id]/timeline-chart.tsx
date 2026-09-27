import { Temporal } from "temporal-polyfill";
import { brDate } from "@/format";
import { type Intervalo, type Status, type Timeline, union } from "@/timeline/timeline";

const STATUS_LABEL: Record<Status, string> = { OK: "OK", PENDENTE: "Pendente", REVISAR: "Revisar", EXCLUIDO: "Excluído" };
const W = 1000;
const LABEL_W = 210;
const ROW = 26;
const AXIS = 22;
const BAR = 14;

const epochDay = (iso: string) => Temporal.PlainDate.from("1970-01-01").until(Temporal.PlainDate.from(iso)).days;

/** Horizontal timeline: one row per período, gap bands behind, the counted union as the last row. */
export function TimelineChart({ timeline }: { timeline: Timeline }) {
  const all = timeline.periodos.flatMap((p) => p.intervalos);
  if (all.length === 0) return <p className="muted">Nenhum período com datas utilizáveis para desenhar.</p>;

  const firstYear = Number(all.map((i) => i.inicio).sort()[0].slice(0, 4));
  const lastYear = Number(all.map((i) => i.fim).sort().at(-1)!.slice(0, 4));
  const d0 = epochDay(`${firstYear}-01-01`);
  const d1 = epochDay(`${lastYear + 1}-01-01`);
  const x = (iso: string) => LABEL_W + ((epochDay(iso) - d0) / (d1 - d0)) * (W - LABEL_W - 24); // right margin keeps the last year label inside
  const xEnd = (iso: string) => x(Temporal.PlainDate.from(iso).add({ days: 1 }).toString()); // inclusive end
  const span = lastYear + 1 - firstYear;
  const step = [1, 2, 5, 10].find((s) => span / s <= 10) ?? 20;
  const years = Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => firstYear + i * step);
  const rows = timeline.periodos.length + 1;
  const height = AXIS + rows * ROW + 6;
  const rowY = (i: number) => AXIS + i * ROW + (ROW - BAR) / 2;
  const range = (i: Intervalo) => `${brDate(i.inicio)} a ${brDate(i.fim)}`;

  return (
    <div className="chart-scroll">
      <svg className="timeline-chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`Linha do tempo de ${firstYear} a ${lastYear}: ${timeline.periodos.length} períodos, ${timeline.lacunas.length} lacunas. Os mesmos dados estão na tabela abaixo.`}>
        {years.map((y) => (
          <g key={y}>
            <line className="chart-grid" x1={x(`${y}-01-01`)} x2={x(`${y}-01-01`)} y1={AXIS - 4} y2={height} />
            <text className="chart-axis" x={x(`${y}-01-01`)} y={12} textAnchor="middle">{y}</text>
          </g>
        ))}
        {timeline.lacunas.map((g) => (
          <rect key={g.inicio} className="chart-gap" x={x(g.inicio)} width={Math.max(2, xEnd(g.fim) - x(g.inicio))} y={AXIS - 4} height={height - AXIS + 4}>
            <title>{`Lacuna: ${range(g)} (${g.dias} dias)`}</title>
          </rect>
        ))}
        {timeline.periodos.map((p, i) => (
          <g key={p.key}>
            <text className="chart-label" x={0} y={rowY(i) + BAR - 3}>{`${p.seq ?? "?"} · ${truncate(p.origem ?? "—", 26)}`}</text>
            {union(p.intervalos).map((iv) => ( // consecutive paid months read as one bar
              <rect key={iv.inicio} className={`chart-bar is-${p.status.toLowerCase()}`} x={x(iv.inicio)} width={Math.max(3, xEnd(iv.fim) - x(iv.inicio) - 1)} y={rowY(i)} height={BAR} rx={3}>
                <title>{`${p.origem ?? "—"}\n${range(iv)}${p.fimInferido ? " (fim inferido)" : ""}\n${STATUS_LABEL[p.status]}${p.confirmado ? " · confirmado" : ""}${p.motivos.length ? `\n${p.motivos.join("\n")}` : ""}`}</title>
              </rect>
            ))}
          </g>
        ))}
        <text className="chart-label chart-label-strong" x={0} y={rowY(rows - 1) + BAR - 3}>Tempo contado</text>
        {timeline.tempo.intervalos.map((iv) => (
          <rect key={iv.inicio} className="chart-bar is-union" x={x(iv.inicio)} width={Math.max(3, xEnd(iv.fim) - x(iv.inicio) - 1)} y={rowY(rows - 1)} height={BAR} rx={3}>
            <title>{`Contado: ${range(iv)}`}</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}

export function ChartLegend() {
  return (
    <ul className="chart-legend" aria-label="Legenda">
      <li><span className="swatch is-ok" /> OK</li>
      <li><span className="swatch is-pendente" /> ⏸ Pendente</li>
      <li><span className="swatch is-revisar" /> ⚠ Revisar</li>
      <li><span className="swatch is-excluido" /> Excluído</li>
      <li><span className="swatch is-union" /> Tempo contado</li>
      <li><span className="swatch is-gap" /> Lacuna</li>
    </ul>
  );
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
