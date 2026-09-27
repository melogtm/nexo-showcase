---
name: cnis-domain
description: Nexo domain knowledge for the CNIS extract. Covers the expected PDF layout, the parser contract (SourceRef, UnparsedFragment), the indicator catalog, timeline normalisation (missing end dates, overlaps, gaps, below-minimum competências, special-period candidates), how contribution time and carência are counted, synthetic fixtures and the H1 evaluation metric. Load before working in src/cnis, src/timeline, fixtures, or the H1 eval.
---

# CNIS domain

## 1. Layout
Observed in public model extracts: UNILAB 2019 (the real text layout with personal data blanked), UFBA 2017 (filled with fake data) and IF Sudeste 2014 (the older "CNIS Cidadão" issue). They're kept locally in `fixtures/real/`, never committed. **No full real extract has been validated yet**, so anything below marked `[VALIDAR]` is unconfirmed.

**On every page:**
- Header: `INSS - INSTITUTO NACIONAL DO SEGURO SOCIAL` / `CNIS - Cadastro Nacional de Informações Sociais` / `Extrato Previdenciário`, plus the issue timestamp `dd/MM/yyyy HH:mm:ss` and `Página N de M`.
- `Identificação do Filiado` is **repeated on every page**: `NIT:`, `CPF:`, `Nome:`, `Data de nascimento:`, `Nome da mãe:`, as label:value pairs, two or three per line.
- Footer: `O INSS poderá rever a qualquer tempo as informações constantes deste extrato, conforme art. 19, § 3° do Decreto 3.048/99.`

Page chrome (header, standalone issue timestamp, footer, authenticity note) and section titles are *recognised* by explicit patterns in `PAGE_CHROME` / `SECTION_TITLES` (`src/cnis/parse.ts`). Only text matching them is skipped. Everything else is consumed into a field or becomes an `UnparsedFragment`.

**`Relações Previdenciárias`:** each vínculo is a block that **repeats its own column-header row**. There are two variants:
- Employment or contribution: `Seq. | NIT | Código Emp.* | Origem do Vínculo | Data Início | Data Fim | Tipo Filiado no Vínculo | Últ. Remun. | Indicadores`. \*The 2017 issue calls it `CNPJ/CEI/CPF`. Origem holds the employer name, `Tipo Filiado` holds e.g. `Empregado`, `Últ. Remun.` is `MM/yyyy`, and Indicadores is e.g. `PEXT`.
- Benefit: `Seq. | NIT | NB | Origem do Vínculo | Espécie | Data Início | Data Fim | Situação`, e.g. `Benefício`, `80 - AUXILIO SALARIO MATERNIDADE`, `CESSADO`. **Team decision (2026-09-27): benefit periods count toward contribution time.** Assumption `[VALIDAR]`: they also count toward **carência** for every month they touch.
- `Data Fim` can be empty (a vínculo with no end date, see §4).
- `[VALIDAR]` In the blanked UNILAB model, the `Remunerações` subtitle sits on the **same line** as the vínculo row, so it lands in `Origem do Vínculo`. If real extracts do the same, the parser must split it off. Check this against the first real extract.

**`Remunerações`** sits under an employment block. It's a grid of **repeated triplets** `Competência | Remuneração | Indicadores`, three per text line. The 2014 issue adds `Agentes Nocivos` to each triplet. The reading order across the grid differs between issues, so **don't depend on order**: every competência identifies itself (`MM/yyyy`). Parse every triplet on a line and sort afterwards.

**`Contribuições`** (contribuinte individual / facultativo): `Competência | Data Pgto. | Contribuição | Salário Contribuição | Indicadores` `[VALIDAR, not seen in the samples]`.

**Last page:**
- `Legenda de Indicadores`: a two-column table `Indicador | Descrição | Indicador | Descrição`, where descriptions **wrap across lines** (e.g. `PREM-EXT` = `Remuneração informada fora do prazo, passível de comprovação`).
- Then an authenticity note: `Você pode conferir a autenticidade do documento em https://meu.inss.gov.br/central/#/autenticidade com o código <CODE>`.

**Formats:** dates `dd/MM/yyyy`, competências `MM/yyyy`, amounts `1.234,56`.

**Never assume fixed column positions.** Anchor on section and header-row text and on these patterns. Use `pdfjs-dist` text items (they carry x/y transforms) to rebuild lines with page and line numbers. Map values to header columns by x-overlap with that block's own header row.

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
- **Competências below the minimum:** they don't count toward carência or contribution time unless topped up. **Implemented through the INSS's own `PREC-MENOR-MIN` indicator** (catalog effect `PENDENCIA`), so no cut-off date or minimum-wage table lives in our code. `[VALIDAR]` whether INSS flags every case.
- **Special-period candidates:** vínculos with a harmful-agent indicator are flagged `CANDIDATO_ESPECIAL`, counted as regular time, with an explicit warning. Classifying special periods needs PPP/LTCAT/CNAE documents that are outside the CNIS, so it's out of scope.
- Row status: `OK` | `PENDENTE` | `REVISAR` | `EXCLUIDO`, with `motivos[]` (these change the status) and `avisos[]` (shown, no effect).
- **Only `OK` counts.** `PENDENTE` and `REVISAR` time is shown separately as "em análise".
- The lawyer's `CONFIRMAR` makes a período (and its readable competências) `OK` when its dates are usable. `EXCLUIR` removes it from the count. `""` reopens it.
- `[VALIDAR]` A contribuinte individual / facultativo counts **paid competências as whole months**, not the vínculo range.
- `[VALIDAR]` Years/months/days are display-only, using 365/30 days (`brDuracao`). All maths is in days.

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

## Code map and storage
- `src/cnis/lines.ts`: `extractLines` (pdfjs → lines with page and line numbers).
- `src/cnis/parse.ts`: `parseLines` / `parseCnis`, the types and `PARSER_VERSION`.
- `src/cnis/synthetic.ts`: `renderCnis`, the generator.
- `public/cnis-exemplo-sintetico.pdf`: the downloadable demo, kept parseable by a test.
- `src/timeline/timeline.ts`: `buildTimeline` (pure).
- `src/timeline/review.ts`: the DB side (catalog, `manual_edit`, `loadReview`).
- `src/app/(app)/analises/[id]`: the review screen, its actions and the SVG chart.
- The whole `CnisExtraction` is stored **immutable** in `analysis.extraction` (jsonb), with `analysis.parser_version`. There are no per-row tables for raw data.
- `manual_edit(analysis_id, target, field, old_value, new_value, justificativa, edited_by, edited_at)`:
  - A database trigger rejects UPDATE and DELETE.
  - `target` is `vinculo:<index into extraction.vinculos>` or `filiado`.
  - `field` is `dataInicio` | `dataFim` | `decisao` (for vínculos) or `sexo` (for the filiado).
  - Rows are replayed by id, and the last write wins.
- `indicator_catalog(code, descricao, efeito)` is seeded by migration `[VALIDAR]`. An unknown code means `REVISAR`.
- Sex isn't reliably in the CNIS, so ask for it on the review screen.
