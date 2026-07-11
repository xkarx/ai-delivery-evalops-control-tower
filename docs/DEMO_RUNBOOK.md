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
2. Analyze evidence and rank opportunities at runtime.
3. Create a human-gated feature decision, PRD, dependencies, and tickets.
4. Execute two independent engineering workstreams with isolated branches and PR references in the mock code-host adapter.
5. Run a critical regression campaign that blocks release.
6. Apply the correction and rerun; the passing campaign unlocks the release.
7. Generate capped traffic with persistent `CUS-*` identifiers.
8. Convert a simulated incident into a regression case and retain the lineage edge.

Use `corepack pnpm demo:reset` to clear runtime artifacts and regenerate only the synthetic company. `corepack pnpm demo:verify` validates the final state and fails if the blocked and passing campaigns or two engineering runs are absent.

Every provider action is labeled `mocked`, `simulated`, or `synthetic`. Connected mode is enabled only after the manual checklist is complete.
