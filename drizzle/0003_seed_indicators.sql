-- The edit log is audit evidence: the database itself refuses changes to past rows.
CREATE FUNCTION manual_edit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'manual_edit is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER manual_edit_append_only BEFORE UPDATE OR DELETE ON manual_edit
  FOR EACH ROW EXECUTE FUNCTION manual_edit_append_only();
--> statement-breakpoint
-- [VALIDAR] Codes and descriptions from the CNIS legends seen so far; effects are the team's reading of them.
-- An indicator missing here is treated as REVISAR by the timeline, never ignored.
INSERT INTO indicator_catalog (code, descricao, efeito) VALUES
  ('PEXT', 'Pendência de vínculo extemporâneo', 'PENDENCIA'),
  ('PREM-EXT', 'Remuneração informada fora do prazo, passível de comprovação', 'PENDENCIA'),
  ('PREC-MENOR-MIN', 'Recolhimento abaixo do valor mínimo: não conta sem complementação', 'PENDENCIA'),
  ('IEAN', 'Exposição a agente nocivo informada', 'CANDIDATO_ESPECIAL');
