<p align="center">
  <img src="public/nexo-logo.png" alt="Nexo" width="140">
</p>

<h1 align="center">Nexo</h1>

<p align="center">
  <em>From the CNIS to the retirement scenario, with every number traceable.</em>
</p>

<p align="center">
  <a href="https://github.com/melogtm/nexo-showcase/actions/workflows/ci.yml"><img src="https://github.com/melogtm/nexo-showcase/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/Next.js-16-343431" alt="Next.js 16">
  <img src="https://img.shields.io/badge/ACH2008-EACH%2FUSP-C22D2D" alt="ACH2008 · EACH/USP">
</p>

---

Nexo is a web app for Brazilian social-security (*previdenciário*) lawyers. Upload a client's **CNIS** extract (the PDF from Meu INSS) and get:

1. **A contribution timeline** you can review and edit. Every row has a status (`OK` / `PENDENTE` / `REVISAR`), and every edit is logged.
2. **The EC 103/2019 retirement scenarios side by side**: the four transition rules plus the permanent rule. Each shows eligibility today, the requirements that are met or missing, and a projected date.
3. **A trail behind every number**: CNIS page and line, the rule applied, and the rule version.

4. **A lawsuit board** (Jira-style columns: Novo, Em andamento, Em julgamento, Recurso, Concluído) fed by the Jusbrasil API. Cards move by themselves as court movements arrive, and you can drag them by hand; every move is logged with the movement or reason behind it.

5. **Planning, alerts and a conferência checklist** (v1.2): simulate "what if the client stops contributing on a date" against continuous contribution; see on the dashboard which clients reach a rule within 24 months; and get, per analysis, what to check and which documents to ask the client for, with a printable list.

Set `JUSBRASIL_API_TOKEN` to read real lawsuits; without it the board uses synthetic demo data. `CRON_SECRET` enables the daily sync (`vercel.json` crons).

Lawyers do this by hand today, copying values between the PDF, a spreadsheet and a calculator. Nexo treats **extraction → calculation → justification** as one auditable chain.

> Academic MVP (ACH2008, EACH/USP), not a production legal product. Nothing here is legal advice.

## What it has to prove

| | Hypothesis | How |
|---|---|---|
| **H1** | Reliable extraction under incomplete information | A deterministic parser (no LLM). Anything it can't read shows up as `REVISAR` or as an unparsed excerpt, never as a silent error. Measured with `npm run eval:h1`. |
| **H2** | Versioned, re-executable rules | Legal parameters are data rows with validity periods. A saved calculation re-runs to the exact same result. |

## How it works

```mermaid
flowchart LR
  A[CNIS PDF] -->|parseCnis| B[Extraction<br/><sub>immutable, SourceRef per field</sub>]
  B -->|buildTimeline + edit log| C[Timeline]
  C -->|evaluate + rule versions| D[Scenarios + trail]
  D --> E[HTML report · petition draft]
```

The core is a set of pure functions. The database and the UI are thin shells around them. Lawyer edits are an append-only log replayed over the untouched parser output, so every change stays auditable.

## Quick start

Requires Node ≥ 22. No Docker needed: dev and tests run on embedded PGlite.

```bash
npm ci
npm run dev        # http://localhost:3000 · login nexo / nexo
```

Try it with the synthetic samples: [`public/cnis-exemplo-sintetico.pdf`](public/cnis-exemplo-sintetico.pdf) (a 51-year-old client with pending items) and [`public/cnis-exemplo-sintetico-2.pdf`](public/cnis-exemplo-sintetico-2.pdf) (a client close to retirement; regenerate with `npx tsx scripts/gen-cnis-exemplo-2.ts`).

### Roteiro de demonstração (pt-BR, ~4 min)
1. **Login** `nexo` / `nexo`. O Painel abre vazio.
2. **Análises → Nova análise** com o exemplo 1 ("Maria"). Mostre os vínculos em *Precisam de atenção* e o card **Conferência e documentos**; abra **Lista de documentos para o cliente**.
3. **Nova análise** com o exemplo 2 ("João"). Informe sexo **Masculino** e **Calcular cenários**: a idade mínima progressiva já é atingida.
4. Na tela de cenários, **Planejamento**: contribuições param em 31/12/2026 → **Simular**. A tabela mostra o que *adia* e o que *deixa de atingir* em relação à contribuição contínua.
5. **Painel**: o João aparece em **Alertas de aposentadoria** ("Já pode pedir").
6. **Processos → Carregar 8 processos de exemplo**, arraste um card de coluna, abra um processo e mostre a movimentação que define a etapa.

| Command | What it does |
|---|---|
| `npm test` | Vitest, each file on a fresh in-memory database |
| `npm run lint && npx tsc --noEmit` | Lint and type-check |
| `npm run eval:h1` | H1 extraction metric on the public sample |
| `npm run db:generate` | New SQL migration after editing `src/db/schema.ts` |

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Drizzle ORM · Postgres (Neon in prod, PGlite locally) · Temporal for dates · Vitest. Deployed on Vercel.

## Security & privacy

- **No real CNIS in the repo.** The public deploy runs on synthetic data only, and CPF, NIT and names are never logged.
- Single-user login with an HMAC-signed cookie. The session is re-checked in every server action and route.
- **Supply chain:** installs from the lockfile only (`npm ci`), with install scripts disabled. Registry signatures are verified in CI, and Dependabot waits 7 days before proposing a new release.
- `main` is protected: changes land through a PR with green CI.

<p align="center"><sub>✱ NEXO</sub></p>
