---
name: rule-engine
description: Nexo's versioned retirement-rule engine (hypothesis H2). Covers the rule_version model, parameter vs logic versioning, the five EC 103/2019 eligibility rules, the reproducible calculation_run, the calculation trail tree, and how to add a new rule version safely. Load before working in src/rules, src/scenarios, src/audit, rule seed migrations, or the RMI stretch.
---

# Rule engine (H2)

## 1. Rules as data
Each rule version is a `rule_version` row:
- `rule_code` (e.g. `EC103_ART15_PONTOS`)
- `version` (increasing integer, per `rule_code`)
- `valid_from`, `valid_to` (when the version is in force)
- `legal_basis` (text: the legal provision)
- `parameters` (jsonb: points per year, ages per year, minimum times, cut-off dates…)
- `logic_version` (which implementation evaluates it, see §2)
- `content_hash` (SHA-256 of the canonical parameters JSON: keys sorted, no whitespace)

The **parameters** come from the DB. Changing a number means inserting a new version row through a migration, with no code change. **Rows are never updated or deleted.**

## 2. Logic is versioned too
Versioning parameters alone isn't enough for H2. If the TypeScript for `EC103_ART15` changes, old runs stop reproducing. So:
- Each rule implementation is a pure function `(timeline, params, refDate) → { eligible, met[], missing[], projectedDate?, trail }` in `src/rules/<code>.v<N>.ts`.
- A registry maps `(rule_code, logic_version)` to that function. **Implementation files are append-only.** A behaviour change means a new `.v<N+1>.ts` and new `rule_version` rows that point at it. Pure refactors that don't change results are fine in place, as long as the reproducibility test stays green.

## 3. MVP rules `[VALIDAR every parameter against the text of EC 103/2019]`
Eligibility only, no RMI:
- **Permanent rule (art. 19):** minimum age plus minimum contribution time, by sex.
- **Points transition (art. 15):** age + contribution time ≥ that year's points. The points rise by 1 per year up to a cap, with a minimum contribution time by sex.
- **Progressive minimum-age transition (art. 16):** the minimum age rises 6 months per year up to a cap, with a minimum time by sex.
- **50% toll (art. 17):** only for people who on 13/11/2019 were within 2 years of the minimum time. They must serve 50% of the time that was missing.
- **100% toll (art. 20):** minimum age plus minimum time plus 100% of the time missing on 13/11/2019.

Table values (points per year, ages per year, caps, the 13/11/2019 cut-off) go into a seed migration with a `-- [VALIDAR]` comment on each. **No legal number appears in TypeScript**, not even in tests. Tests read the seeded parameters or use explicit fixture parameters.

Projected eligibility date: assume continuous contributions from the reference date onward.

## 4. Reproducibility
Each scenario run writes a `calculation_run` with: `analysis_id`, the PDF hash, `timeline_snapshot` (jsonb, after the lawyer's edits), `rule_versions` (jsonb: `id`, `content_hash` and `logic_version` for each rule used), `reference_date`, `result`, `trail`, `created_at`.

**Acceptance test:** re-running an old `calculation_run` (calling `evaluate` with its stored snapshot, versions and date) gives a result deep-equal to the stored one, **even after a newer version of the rule has been inserted.** The re-run loads versions by stored `id` and checks `content_hash`, never "the version in force today". A hash mismatch is a hard error, never a silent recompute.

## 5. Calculation trail
Every number shown in the scenarios is clickable and has a trail: which periods went in, which `SourceRef` they came from, which manual edits changed them, and which rule, version and parameter was applied. It's stored as a tree in `calculation_run.trail` (jsonb):
```ts
type TrailNode = { label: string; value?: string; source?: SourceRef; editIds?: number[];
                   rule?: { code: string; version: number; param?: string }; children?: TrailNode[] };
```

## 6. As built (stage 4)
- `src/rules/core.ts`: `RuleContext` and the measuring helpers (`tempoDias`, `carenciaMeses`, `idadeMeses`, `idadeDias`), shared by every rule. Changing their output changes old runs, so the reproducibility test must stay green.
  - `Requisito` holds **numbers plus a unit**. Formatting happens only in the UI, so re-runs compare exactly.
  - `canonicalJson` / `contentHash` also live here.
- `src/rules/ec103-art{15,16,17,19,20}.v1.ts` plus `registry.ts` (`ruleKey(code, logicVersion)`). Rule codes:
  - `EC103_ART19_PERMANENTE`
  - `EC103_ART15_PONTOS`
  - `EC103_ART16_IDADE_PROGRESSIVA`
  - `EC103_ART17_PEDAGIO_50`
  - `EC103_ART20_PEDAGIO_100`
- `src/scenarios/evaluate.ts` (pure):
  - `scenarioInput(extraction, timeline, sexoEditIds)` builds the frozen snapshot: counted time intervals, carência, birth date with its source, sexo, and the OK períodos for the trail.
  - `evaluate(input, versions, referencia)` checks every version's hash, runs each rule for today, projects the eligibility date (month ends, then days; 60-year horizon), and builds the trail.
- `src/scenarios/store.ts`:
  - `activeRuleVersions(ref)`: the latest version in force on that date.
  - `createRun`.
  - `rerun(runId)`: loads versions by stored id, refuses on a hash or logic mismatch, and compares canonical JSON.
- Seeds are in `drizzle/0005_seed_rules.sql`, with the `[VALIDAR]` reading of each article above its row.
  - Every rule also requires **180 months of carência**.
  - `diasPorAno: 365` converts years of contribution to days.
  - The art. 17 cut-off test is strict: less than 2 years missing.
- `rule_version` and `calculation_run` have the `append_only()` trigger.
- Tests (`src/scenarios/scenarios.test.ts`):
  - rule logic uses **fixture** parameters, never the legal ones;
  - the projection is checked for minimality;
  - the seeded hashes are verified;
  - a stored run reproduces exactly after a new version is inserted;
  - an altered stored result is detected.

## 7. Worked example: a logic change (stage 5, art. 17)
v1 reported "not applicable" as a sentence with raw day counts. The fix changed the rule's output, so:
1. `ec103-art17.v1.ts` was left **untouched**.
2. `ec103-art17.v2.ts` was added. It uses the same parameters and reports the cut-off as a `Requisito` with `comparacao: "maximo"`.
3. `EC103_ART17_PEDAGIO_50@2` was added to the registry.
4. `drizzle/0006_art17_v2.sql` inserts version 2 with the same parameters and `content_hash`, and `logic_version = 2`.

New runs now pick v2; old runs still re-execute with v1. Follow the same procedure for any future behaviour change.

## 8. Presentation (stage 5)
- `src/scenarios/present.ts` is shared by the page and the report: display order (permanent rule first), `requirementText`, `verdict`, `earliest` ("atingida mais cedo", which is not "most advantageous" because RMI isn't computed), `humanize` for trail values (it merges consecutive ranges), and `paramValue`.
- `src/scenarios/report.ts`: `renderReport`, a self-contained HTML page. **Every interpolated value goes through `esc()`**; tested.
- The report is served by `.../cenarios/[runId]/relatorio` (`?download` makes it an attachment) with `Cache-Control: private, no-store`.
- The scenarios page shows each requirement in a `<details>` holding its trail: the parameter and its value, the periods with their CNIS page/line/raw text, and links to the edits (`/analises/:id#edit-N`, highlighted through `:target`).

## 9. Stretch (only after stages 2–5 are green)
1. RMI: the average of 100% of salaries since 07/1994, corrected by INPC (index table loaded from CSV), with a coefficient of 60% + 2% per year above the threshold `[VALIDAR]`. This is where a decimal library earns its place (index factors). Until then, integer centavos are enough.
2. A petition draft from a template, filled with the chosen scenario's values and citing the trail. An LLM is allowed here, and only here.
