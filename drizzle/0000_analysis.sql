CREATE TABLE "analysis" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "analysis_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_label" text NOT NULL,
	"pdf_sha256" text NOT NULL,
	"pdf" "bytea" NOT NULL,
	"status" text DEFAULT 'UPLOADED' NOT NULL
);
