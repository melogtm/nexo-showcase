---
name: stage-gate
description: Close a Nexo roadmap stage (see CLAUDE.md "Roadmap"). Runs tests/types/lint, the spec-guardian review, react-doctor and a ponytail over-engineering review, then makes one commit. Use when the user says "stage done", "close the stage", "/stage-gate", or when a roadmap stage looks finished.
---

# Stage gate

Every stage ends with passing checks and one commit. The next stage never starts on a broken one. Run these steps in order and stop at the first failure.

1. **Checks.** `npm test && npx tsc --noEmit && npm run lint && npm run build`. Red → fix the root cause (use superpowers:systematic-debugging), then start again from step 1.
2. **Spec review.** Dispatch the `spec-guardian` agent. Fix every violation. For a `?` finding, fix it or tell the user why it stands.
3. **React review.** `npm run doctor -- --verbose --scope changed`. Fix real findings and ignore pure style.
4. **Over-engineering review.** Run `ponytail:ponytail-review` on the stage diff. Apply the cuts that don't break an invariant.
5. **Re-run step 1** if steps 2–4 changed code.
6. **Commit.** Check `git status` for secrets, `.env*`, `.pglite/`, or PDFs outside test fixtures. Then make one commit: `stage N: <what the stage delivers>`, with the body listing any deviations from CLAUDE.md or the skills. Tick the stage in the CLAUDE.md roadmap in the same commit. Push only if the user asked.
7. **Report** to the user in at most five lines: stage, test count, any deviations, and the next stage.
