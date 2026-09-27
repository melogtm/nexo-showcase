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

## 6. Stretch (only after stages 2–5 are green)
1. RMI: the average of 100% of salaries since 07/1994, corrected by INPC (index table loaded from CSV), with a coefficient of 60% + 2% per year above the threshold `[VALIDAR]`. This is where a decimal library earns its place (index factors). Until then, integer centavos are enough.
2. A petition draft from a template, filled with the chosen scenario's values and citing the trail. An LLM is allowed here, and only here.
