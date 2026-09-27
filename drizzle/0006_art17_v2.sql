-- Art. 17, version 2: same parameters (same content_hash) as version 1, evaluated by logic_version 2, which reports
-- the cut-off condition as a numeric requirement. Runs made with version 1 keep re-executing with logic 1.
INSERT INTO rule_version (rule_code, version, nome, valid_from, valid_to, legal_basis, parameters, logic_version, content_hash)
SELECT rule_code, 2, nome, valid_from, valid_to, legal_basis, parameters, 2, content_hash
FROM rule_version WHERE rule_code = 'EC103_ART17_PEDAGIO_50' AND version = 1;
