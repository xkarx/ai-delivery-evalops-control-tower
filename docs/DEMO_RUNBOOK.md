# V1 demo runbook

The demo is deterministic and requires no provider credentials.

```bash
corepack pnpm install
corepack pnpm demo
corepack pnpm dev
```

Open `http://localhost:3000`. The control tower reads `artifacts/demo-state.json` when present and falls back to the checked-in schema-valid fixture on a clean clone.

The scripted run performs the complete vertical slice:

1. Generate DailyCart company data with `SYNTHETIC_DATA_SEED`.
2. Analyze evidence and rank opportunities at runtime from the versioned company context pack.
3. Run explicit UX and engineering-feasibility reviews, then create a PM-owned implementation brief and human-gated feature decision.
4. TPM consumes the approved brief to create dependencies, readiness checks, and tickets; it does not author the brief.
5. Execute two independent engineering workstreams and offer an isolated product preview build.
6. Run a critical regression campaign that blocks release.
7. Apply the correction and rerun; the passing campaign unlocks the release.
8. Generate capped traffic with persistent `CUS-*` identifiers and checkout recovery telemetry.
9. Convert a simulated incident into a regression case and retain the lineage edge.
10. Sync the Linear roadmap, Slack logical-agent handoff thread, Langfuse trace/score, Inngest event, and Supabase external references.

Use `corepack pnpm demo:reset` to clear runtime artifacts and regenerate only the synthetic company. `corepack pnpm demo:verify` validates the final state and fails if the blocked and passing campaigns or two engineering runs are absent.

Every provider action is labeled `mocked`, `simulated`, or `synthetic`. Connected mode is enabled only after the manual checklist is complete.
