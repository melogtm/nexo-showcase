import { bigint, customType, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
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
