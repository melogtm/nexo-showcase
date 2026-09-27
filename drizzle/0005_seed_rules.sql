-- Rule versions and calculation runs are evidence for H2: the database refuses changes to past rows.
CREATE FUNCTION append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER rule_version_append_only BEFORE UPDATE OR DELETE ON rule_version FOR EACH ROW EXECUTE FUNCTION append_only();
--> statement-breakpoint
CREATE TRIGGER calculation_run_append_only BEFORE UPDATE OR DELETE ON calculation_run FOR EACH ROW EXECUTE FUNCTION append_only();
--> statement-breakpoint
-- [VALIDAR] Every number below is the project's reading of EC 103/2019 (RGPS, urban worker), not a verified legal source.
-- Shared: carência of 180 contributions (Lei 8.213/91, art. 25, II); 365 days per year when converting years of contribution.
-- content_hash = SHA-256 of the canonical JSON (keys sorted, no spaces), computed by contentHash() in src/rules/core.ts;
-- src/scenarios/scenarios.test.ts fails if any seeded row disagrees with it.
INSERT INTO rule_version (rule_code, version, nome, valid_from, valid_to, legal_basis, parameters, logic_version, content_hash) VALUES
  -- Art. 19: 62 (F) / 65 (M) years of age; 15 (F) / 20 (M) years of contribution.
  ('EC103_ART19_PERMANENTE', 1, 'Regra permanente', '2019-11-13', NULL, 'EC 103/2019, art. 19, caput',
   '{"idadeMinimaAnos":{"F":62,"M":65},"tempoMinimoAnos":{"F":15,"M":20},"carenciaMinimaMeses":180,"diasPorAno":365}', 1,
   '38706edd6e2ac806aa335978690ca1b76103c58c6ea6342e5307b38db9fc604f'),
  -- Art. 15: 86 (F) / 96 (M) points in 2019, +1 per year from 2020, up to 100 (F) / 105 (M); 30 (F) / 35 (M) years of contribution.
  ('EC103_ART15_PONTOS', 1, 'Transição por pontos', '2019-11-13', NULL, 'EC 103/2019, art. 15',
   '{"pontosBase":{"F":86,"M":96},"anoBase":2019,"incrementoAnual":1,"pontosTeto":{"F":100,"M":105},"tempoMinimoAnos":{"F":30,"M":35},"carenciaMinimaMeses":180,"diasPorAno":365}', 1,
   '19fd167978c2ef45e7f33e8d8d657954040683a15e07189bf96f93d843ed6775'),
  -- Art. 16: 56 (F) / 61 (M) years of age in 2019, +6 months per year from 2020, up to 62 (F) / 65 (M); 30 (F) / 35 (M) years.
  ('EC103_ART16_IDADE_PROGRESSIVA', 1, 'Idade mínima progressiva', '2019-11-13', NULL, 'EC 103/2019, art. 16',
   '{"idadeBaseMeses":{"F":672,"M":732},"anoBase":2019,"incrementoMesesPorAno":6,"idadeTetoMeses":{"F":744,"M":780},"tempoMinimoAnos":{"F":30,"M":35},"carenciaMinimaMeses":180,"diasPorAno":365}', 1,
   'bbf257ddca24fabff8c262de101300bfd87073a9b243743384a906a95630adb8'),
  -- Art. 17: on 13/11/2019 more than 28 (F) / 33 (M) years (less than 2 missing); 30 (F) / 35 (M) + 50% of what was missing.
  ('EC103_ART17_PEDAGIO_50', 1, 'Pedágio de 50%', '2019-11-13', NULL, 'EC 103/2019, art. 17',
   '{"dataCorte":"2019-11-13","tempoMinimoAnos":{"F":30,"M":35},"faltaMaximaAnosNaDataCorte":2,"pedagioPercentual":50,"carenciaMinimaMeses":180,"diasPorAno":365}', 1,
   '74bfe362f8ea6f477e8f0ffebf98fb76e4ddf0d336f3208d19964da38467be47'),
  -- Art. 20: 57 (F) / 60 (M) years of age; 30 (F) / 35 (M) years + 100% of what was missing on 13/11/2019.
  ('EC103_ART20_PEDAGIO_100', 1, 'Pedágio de 100%', '2019-11-13', NULL, 'EC 103/2019, art. 20',
   '{"dataCorte":"2019-11-13","idadeMinimaAnos":{"F":57,"M":60},"tempoMinimoAnos":{"F":30,"M":35},"pedagioPercentual":100,"carenciaMinimaMeses":180,"diasPorAno":365}', 1,
   'd3d992d653f7143e50cb2640333340b21d13459b21f278c64a9e921d429b911d');
