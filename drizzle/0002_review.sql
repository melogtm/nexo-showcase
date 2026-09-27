CREATE TABLE "indicator_catalog" (
	"code" text PRIMARY KEY NOT NULL,
	"descricao" text NOT NULL,
	"efeito" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_edit" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "manual_edit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"analysis_id" bigint NOT NULL,
	"target" text NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text NOT NULL,
	"justificativa" text,
	"edited_by" text NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manual_edit" ADD CONSTRAINT "manual_edit_analysis_id_analysis_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analysis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manual_edit_analysis_idx" ON "manual_edit" USING btree ("analysis_id");