import { bigint, customType, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Uint8Array }>({ dataType: () => "bytea" });

export const analysis = pgTable("analysis", {
  id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  clientLabel: text("client_label").notNull(),
  pdfSha256: text("pdf_sha256").notNull(),
  // ponytail: PDF kept in Postgres (serverless has no disk); move to object storage if PDFs outgrow Neon's 0.5GB.
  pdf: bytea().notNull(),
  status: text({ enum: ["UPLOADED"] }).notNull().default("UPLOADED"),
});
