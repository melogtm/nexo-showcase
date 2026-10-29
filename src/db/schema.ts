import { bigint, customType, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import type { CnisExtraction } from "@/cnis/parse";
import type { Resultado, RuleVersion, ScenarioInput, TrailNode } from "@/scenarios/evaluate";
import { STAGE_IDS } from "@/processos/stages";
import type { ProcessoSnapshot } from "@/processos/types";

const bytea = customType<{ data: Uint8Array }>({ dataType: () => "bytea" });

export const analysis = pgTable("analysis", {
  id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  clientLabel: text("client_label").notNull(),
  pdfSha256: text("pdf_sha256").notNull(),
  // ponytail: PDF kept in Postgres (serverless has no disk); move to object storage if PDFs outgrow Neon's 0.5GB.
  pdf: bytea().notNull(),
  status: text({ enum: ["UPLOADED", "PARSED"] }).notNull().default("UPLOADED"),
  // Raw parser output, never mutated: lawyer edits are replayed on top of it (stage 3).
  parserVersion: integer("parser_version"),
  extraction: jsonb().$type<CnisExtraction>(),
});

/** Indicator code → effect on the timeline. Seeded by migration; edit rows here to change behaviour without a deploy. */
export const indicatorCatalog = pgTable("indicator_catalog", {
  code: text().primaryKey(),
  descricao: text().notNull(),
  efeito: text({ enum: ["PENDENCIA", "REVISAR", "CANDIDATO_ESPECIAL", "INFORMATIVO"] }).notNull(),
});

/** Append-only log of the lawyer's changes, replayed over the immutable extraction. Never UPDATE or DELETE. */
export const manualEdit = pgTable(
  "manual_edit",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    analysisId: bigint("analysis_id", { mode: "number" }).notNull().references(() => analysis.id),
    target: text().notNull(), // "vinculo:<index>" | "filiado"
    field: text().notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value").notNull(),
    justificativa: text(),
    editedBy: text("edited_by").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("manual_edit_analysis_idx").on(t.analysisId)],
);

/** A rule's parameters, versioned. Rows are never updated or deleted (DB trigger); a new number = a new version. */
export const ruleVersion = pgTable(
  "rule_version",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    ruleCode: text("rule_code").notNull(),
    version: integer().notNull(),
    nome: text().notNull(),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
    legalBasis: text("legal_basis").notNull(),
    parameters: jsonb().notNull(),
    logicVersion: integer("logic_version").notNull(),
    contentHash: text("content_hash").notNull(),
  },
  (t) => [unique().on(t.ruleCode, t.version)],
);

/** One scenario calculation with its frozen inputs, so it can be re-executed and compared (H2). Append-only. */
export const calculationRun = pgTable("calculation_run", {
  id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  analysisId: bigint("analysis_id", { mode: "number" }).notNull().references(() => analysis.id),
  pdfSha256: text("pdf_sha256").notNull(),
  referenceDate: date("reference_date").notNull(),
  timelineSnapshot: jsonb("timeline_snapshot").$type<ScenarioInput>().notNull(),
  ruleVersions: jsonb("rule_versions").$type<Pick<RuleVersion, "id" | "contentHash" | "logicVersion">[]>().notNull(),
  result: jsonb().$type<Resultado[]>().notNull(),
  trail: jsonb().$type<Record<string, TrailNode>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A lawsuit on the board. `snapshot` is the provider's latest reading (Jusbrasil or demo), replaced at each sync. */
export const processo = pgTable(
  "processo",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    numeroCnj: text("numero_cnj").notNull().unique(),
    clientLabel: text("client_label"),
    analysisId: bigint("analysis_id", { mode: "number" }).references(() => analysis.id),
    fonte: text({ enum: ["JUSBRASIL", "DEMO"] }).notNull(),
    stage: text({ enum: STAGE_IDS }).notNull(),
    /** AUTO: placed by the movements. MANUAL: the lawyer moved it; a newer court movement can move it again. */
    stageOrigem: text("stage_origem", { enum: ["AUTO", "MANUAL"] }).notNull(),
    stageMotivo: text("stage_motivo"),
    stageAlteradoEm: timestamp("stage_alterado_em", { withTimezone: true }).notNull().defaultNow(),
    ultimaMovimentacaoEm: date("ultima_movimentacao_em"),
    sincronizadoEm: timestamp("sincronizado_em", { withTimezone: true }).notNull().defaultNow(),
    snapshot: jsonb().$type<ProcessoSnapshot>().notNull(),
  },
  (t) => [index("processo_stage_idx").on(t.stage)],
);

/** Append-only history of a lawsuit on the board: imports, column changes (auto or manual) and syncs that brought news. */
export const processoEvento = pgTable(
  "processo_evento",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    processoId: bigint("processo_id", { mode: "number" }).notNull().references(() => processo.id),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    tipo: text({ enum: ["IMPORTADO", "ETAPA", "SINCRONIZADO"] }).notNull(),
    de: text({ enum: STAGE_IDS }),
    para: text({ enum: STAGE_IDS }),
    origem: text({ enum: ["AUTO", "MANUAL"] }).notNull(),
    motivo: text(),
    novasMovimentacoes: integer("novas_movimentacoes").notNull().default(0),
    editedBy: text("edited_by"),
  },
  (t) => [index("processo_evento_processo_idx").on(t.processoId)],
);

/** INPC number index (IBGE SIDRA table 1736, dez/1993 = 100), used to correct salários for the RMI. Append-only: published months never change. */
export const inpcIndice = pgTable("inpc_indice", {
  competencia: text().primaryKey(), // YYYY-MM
  indice: numeric().notNull(), // exact decimal, read as a string
});
