CREATE TABLE "processo" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "processo_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"numero_cnj" text NOT NULL,
	"client_label" text,
	"analysis_id" bigint,
	"fonte" text NOT NULL,
	"stage" text NOT NULL,
	"stage_origem" text NOT NULL,
	"stage_motivo" text,
	"stage_alterado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_movimentacao_em" date,
	"sincronizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "processo_numero_cnj_unique" UNIQUE("numero_cnj")
);
--> statement-breakpoint
CREATE TABLE "processo_evento" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "processo_evento_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"processo_id" bigint NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"tipo" text NOT NULL,
	"de" text,
	"para" text,
	"origem" text NOT NULL,
	"motivo" text,
	"novas_movimentacoes" integer DEFAULT 0 NOT NULL,
	"edited_by" text
);
--> statement-breakpoint
ALTER TABLE "processo" ADD CONSTRAINT "processo_analysis_id_analysis_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analysis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processo_evento" ADD CONSTRAINT "processo_evento_processo_id_processo_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processo_stage_idx" ON "processo" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "processo_evento_processo_idx" ON "processo_evento" USING btree ("processo_id");