---
name: cnis-domain
description: Nexo domain knowledge for the CNIS extract. Covers the expected PDF layout, the parser contract (SourceRef, UnparsedFragment), the indicator catalog, timeline normalisation (missing end dates, overlaps, gaps, below-minimum competências, special-period candidates), how contribution time and carência are counted, synthetic fixtures and the H1 evaluation metric. Load before working in src/cnis, src/timeline, fixtures, or the H1 eval.
---

# CNIS domain

## 1. Expected layout `[VALIDAR against real PDFs]`
The CNIS (Cadastro Nacional de Informações Sociais) extract usually has:
- **Filiado identification:** NIT, CPF, name, birth date, mother's name.
- **Relações previdenciárias** (one per vínculo): Seq., NIT, employer code/CNPJ, vínculo origin, filiado type in the vínculo, start date, end date, last remuneration, indicators.
- **Remunerações** per vínculo: competência (MM/AAAA), amount, indicators.
- **Contribuições** (contribuinte individual / facultativo): competência, payment date, contribution, salário de contribuição, indicators.
- An indicator legend at the end.

The layout varies between issues. **Never assume fixed column positions.** Anchor on section headers and on patterns: dates `dd/MM/yyyy`, competências `MM/yyyy`, amounts `1.234,56`. Use `pdfjs-dist` text items (they carry x/y transforms) to rebuild lines with page and line numbers.

## 2. Parser contract
`parseCnis(bytes) → CnisExtraction` is pure and deterministic, with no DB access and no LLM. The result is raw, before any interpretation:
- `filiado`
- `vinculos: RawVinculo[]`, each with `remuneracoes: RawRemuneracao[]` or `contribuicoes: RawContribuicao[]`
- `unparsed: UnparsedFragment[]`: every piece of text that matched no pattern, with page and line
- `parserVersion` (bump it whenever parsing behaviour changes; stored per analysis so H1 results can be compared across versions)

Every extracted field carries `SourceRef { page, line, rawText }`, with no exceptions.

**Golden rule: never discard text silently.** A line the parser didn't understand goes to `UnparsedFragment` and appears on the review screen. A parser that "works" because it ignores what it doesn't understand is exactly the failure H1 measures. A `catch`/`continue` that drops input is a bug.

## 3. Indicators
The `indicator_catalog` table (a seeded migration) holds `code, descricao, efeito`, where `efeito ∈ PENDENCIA | REVISAR | CANDIDATO_ESPECIAL | INFORMATIVO`. Examples to confirm against the CNIS's own legend `[VALIDAR]`:
- `PEXT`: late-registered (extemporâneo) vínculo.
- `PREC-MENOR-MIN`: remuneration below the minimum.
- `IEAN`: exposure to a harmful agent.

An **unknown indicator → `REVISAR`**, never ignored.

## 4. Timeline normalisation
`buildTimeline(extraction, edits) → Timeline` of normalised `Periodo`s. The raw extraction is never mutated. Edits from `manual_edit` are replayed on top.
- **Vínculo without an end date:** if later remunerações exist, infer the end from the last competência and mark `REVISAR` with a reason. If none exist, mark `REVISAR`.
- **Overlap (concomitância):** overlapping periods count **once** toward contribution time. Show the overlap visually. Don't add up concurrent salaries in the MVP; just flag them.
- **Gaps (lacunas):** intervals with no vínculo or contribution between the first and last period. List each with its duration.
- **Competências below the minimum** (after 13/11/2019 `[VALIDAR]`): they don't count toward carência or contribution time unless topped up. Mark them. The cut-off date is a rule parameter, not a constant.
- **Special-period candidates:** vínculos with a harmful-agent indicator are flagged `CANDIDATO_ESPECIAL`, counted as regular time, with an explicit warning. Classifying special periods needs PPP/LTCAT/CNAE documents that are outside the CNIS, so it's out of scope.
- Row status: `OK` | `PENDENTE` | `REVISAR`, plus `statusMotivo`.

## 5. Counting
- **Contribution time** is calendar days, **inclusive**, over the **union** of intervals (no double counting). Display it as years/months/days.
- **Carência** is the number of competências (months) with a valid contribution, not days.
- Hand-built test cases are required: overlapping vínculos, adjacent vínculos, a leap year, a one-day vínculo.
- Use `Temporal.PlainDate` / `PlainYearMonth` and integer centavos. Never JS `Date` or float money.

## 6. Test data and privacy
- A real CNIS contains CPF, NIT, name, mother's name and salary history. **No real PDF in the repo.** `fixtures/real/` is gitignored and used only for local manual validation.
- **Synthetic CNIS generator** (`pdf-lib`, imitating the layout) for automated tests. It must cover: a vínculo without an end date, an overlap, a gap, an unknown indicator, a below-minimum competência, and a contribuinte individual.
- The synthetic layout is **not** assumed to match the real one. The team validates the parser against anonymised real PDFs.
- Mask CPF/NIT everywhere they could leak (logs, errors).

## 7. H1 metric (`npm run eval:h1`)
Given a PDF and a hand-annotated JSON answer key (the correct vínculos and competências), report:
- precision and recall per vínculo and per competência;
- **the fraction of errors that were flagged** (`REVISAR` / `UnparsedFragment`) versus silent errors. This is the headline number.

## Planned tables
`filiado(analysis_id, nit, cpf, nome, data_nascimento, sexo)` · `vinculo(analysis_id, seq, empregador, origem, tipo_filiado, data_inicio, data_fim, status, status_motivo, source_ref jsonb)` · `remuneracao(vinculo_id, competencia, valor_centavos, indicadores text[], source_ref jsonb)` · `unparsed_fragment(analysis_id, page, line, raw_text)` · `indicator_catalog(code, descricao, efeito)` · `manual_edit(analysis_id, entity, entity_id, field, old_value, new_value, justificativa, edited_at)`. Sex isn't reliably in the CNIS, so ask for it on the review screen.
