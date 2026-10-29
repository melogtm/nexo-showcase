"use client";

import Link from "next/link";
import { type DragEvent, useActionState, useMemo, useOptimistic, useState, useTransition } from "react";
import { STAGES, type Stage } from "@/processos/stages";
import { Icon } from "../ui";
import { mover, sincronizarTodos } from "./actions";

export type CardData = {
  id: number;
  numeroCnj: string;
  stage: Stage;
  manual: boolean;
  motivo: string | null;
  titulo: string;
  clientLabel: string | null;
  analysisId: number | null;
  local: string;
  ultima: { data: string; titulo: string; quando: string } | null;
  recente: boolean;
};

/**
 * Jira-style board. Cards move by drag and drop or, from the keyboard and on touch screens, with the "Mover para"
 * menu on each card. The move shows at once (optimistic) and is saved as a MANUAL change in the lawsuit's history.
 */
export function Board({ cards, initialFilter, lastSync }: { cards: CardData[]; initialFilter: string; lastSync: string | null }) {
  const [query, setQuery] = useState("");
  const [onlyRecent, setOnlyRecent] = useState(initialFilter === "recentes");
  const [mine, setMine] = useState(false);
  const [optimistic, applyMove] = useOptimistic(cards, (state, m: { id: number; stage: Stage }) => state.map((c) => (c.id === m.id ? { ...c, stage: m.stage, manual: true } : c)));
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const [dragId, setDragId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  const [sync, syncAction, syncing] = useActionState(sincronizarTodos, {});
  const [announce, setAnnounce] = useState("");

  const visible = useMemo(() => {
    const t = query.trim().toLowerCase();
    const digits = t.replace(/\D/g, "");
    return optimistic.filter(
      (c) =>
        (!onlyRecent || c.recente) &&
        (!mine || c.analysisId !== null) &&
        (!t || c.titulo.toLowerCase().includes(t) || (c.clientLabel ?? "").toLowerCase().includes(t) || c.local.toLowerCase().includes(t) || (digits.length >= 3 && c.numeroCnj.replace(/\D/g, "").includes(digits))),
    );
  }, [optimistic, query, onlyRecent, mine]);

  const move = (id: number, stage: Stage) => {
    const card = optimistic.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    setPendingId(id);
    startTransition(async () => {
      applyMove({ id, stage });
      await mover(id, stage);
      setPendingId(null);
    });
    setAnnounce(`Processo ${card.numeroCnj} movido para ${STAGES.find((s) => s.id === stage)!.label}.`);
  };

  const onDrop = (e: DragEvent, stage: Stage) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/plain"));
    setOverStage(null);
    setDragId(null);
    if (id) move(id, stage);
  };

  return (
    <div className="stack">
      <div className="board-toolbar">
        <div className="search">
          <Icon name="search" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nº CNJ, cliente, assunto ou vara" aria-label="Buscar processos" />
        </div>
        <label className="row" style={{ display: "flex", fontWeight: 500 }}>
          <input type="checkbox" checked={onlyRecent} onChange={(e) => setOnlyRecent(e.target.checked)} style={{ width: 16, height: 16 }} />
          Andamento nos últimos 7 dias
        </label>
        <label className="row" style={{ display: "flex", fontWeight: 500 }}>
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} style={{ width: 16, height: 16 }} />
          Com análise vinculada
        </label>
        <form action={syncAction} className="row" style={{ marginLeft: "auto" }}>
          <span className="muted small" role="status">
            {sync.error ? <span className="error">{sync.error}</span> : sync.message ?? (lastSync ? `Última sincronização: ${lastSync}` : "")}
          </span>
          <button type="submit" className="button button-secondary" disabled={syncing}>
            <Icon name="refresh" /> {syncing ? "Sincronizando…" : "Sincronizar tudo"}
          </button>
        </form>
      </div>

      <p className="sr-only" aria-live="polite">{announce}</p>

      <div className="board" role="list" aria-label="Quadro de processos por etapa">
        {STAGES.map((s) => {
          const inCol = visible.filter((c) => c.stage === s.id);
          return (
            <section
              key={s.id}
              id={`col-${s.id}`}
              role="listitem"
              aria-labelledby={`col-${s.id}-title`}
              className={`column${overStage === s.id ? " is-over" : ""}`}
              onDragOver={(e) => {
                if (dragId === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overStage !== s.id) setOverStage(s.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null);
              }}
              onDrop={(e) => onDrop(e, s.id)}
            >
              <div className={`column-head stage-${s.id}`}>
                <span className="dot" aria-hidden="true" />
                <h2 id={`col-${s.id}-title`} style={{ color: "var(--ink)" }}>{s.label}</h2>
                <span className="count">{inCol.length}</span>
              </div>
              <p className="column-hint">{s.hint}</p>
              <div className="column-body">
                {inCol.length === 0 && <p className="column-empty">{dragId !== null ? "Solte aqui" : "Nenhum processo"}</p>}
                {inCol.map((c) => (
                  <article
                    key={c.id}
                    className={`kcard${dragId === c.id ? " is-dragging" : ""}${pendingId === c.id ? " is-pending" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(c.id));
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(c.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStage(null);
                    }}
                    aria-label={`${c.titulo}, ${c.numeroCnj}`}
                  >
                    <div className="kcard-top">
                      {/* draggable=false: otherwise grabbing the card (which this link covers) drags the URL instead of the card. */}
                      <Link href={`/processos/${c.id}`} className="kcard-num" draggable={false}>{c.numeroCnj}</Link>
                      <span className="row" style={{ gap: 4 }}>
                        {c.recente && <span className="badge tone-info" title="Andamento nos últimos 7 dias">Novo andamento</span>}
                        {c.manual && <span className="badge outline" title={c.motivo ?? "Movido manualmente"}>Manual</span>}
                      </span>
                    </div>
                    <div>
                      <p className="kcard-title">{c.titulo}</p>
                      <p className="kcard-sub">{c.clientLabel ?? "Sem cliente"} · {c.local}</p>
                    </div>
                    {c.ultima && (
                      <div className="kcard-last">
                        <span className="muted" title={c.ultima.data}>{c.ultima.quando}</span>
                        <span className="t" title={c.ultima.titulo}>{c.ultima.titulo}</span>
                      </div>
                    )}
                    <div className="kcard-foot">
                      {c.analysisId ? (
                        <Link href={`/analises/${c.analysisId}`} className="small row" style={{ gap: 4, position: "relative", zIndex: 1 }}>
                          <Icon name="calc" size={14} /> Cálculo
                        </Link>
                      ) : (
                        <span />
                      )}
                      <select aria-label={`Mover ${c.numeroCnj} para`} value={c.stage} onChange={(e) => move(c.id, e.target.value as Stage)}>
                        {STAGES.map((o) => <option key={o.id} value={o.id}>{o.id === c.stage ? o.label : `Mover para ${o.label}`}</option>)}
                      </select>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
