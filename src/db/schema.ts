import { bigint, customType, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { CnisExtraction } from "@/cnis/parse";

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
