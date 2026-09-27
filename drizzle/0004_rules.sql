CREATE TABLE "calculation_run" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "calculation_run_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"analysis_id" bigint NOT NULL,
	"pdf_sha256" text NOT NULL,
	"reference_date" date NOT NULL,
	"timeline_snapshot" jsonb NOT NULL,
	"rule_versions" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"trail" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_version" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rule_version_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"rule_code" text NOT NULL,
	"version" integer NOT NULL,
	"nome" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"legal_basis" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"logic_version" integer NOT NULL,
	"content_hash" text NOT NULL,
	CONSTRAINT "rule_version_rule_code_version_unique" UNIQUE("rule_code","version")
);
--> statement-breakpoint
ALTER TABLE "calculation_run" ADD CONSTRAINT "calculation_run_analysis_id_analysis_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analysis"("id") ON DELETE no action ON UPDATE no action;