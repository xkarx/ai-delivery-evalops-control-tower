# Codex Repository Instructions

Before changing code, read:

1. `CONTEXT_INDEX.md`
2. `MASTER_CONTEXT.md`
3. Every file under `context/`
4. The relevant phase file under `tasks/`

## Working rules

- Build a functioning system, not static mock screenshots.
- Synthetic company data is allowed. Agent runs, traces, evals, approvals, workflow state, tests, and release decisions must actually execute.
- Make interfaces visual, interactive, responsive, and evidence-linked.
- Keep integrations behind adapters with both mock and live implementations.
- Support `DEMO_MODE=synthetic` without credentials and `INTEGRATION_MODE=live` when credentials are supplied.
- Never commit secrets.
- Generate structured synthetic data deterministically with a configurable seed.
- Preserve shared lineage IDs from evidence through production outcomes.
- Reuse open-source code only after license review and attribution.
- Run lint, type checks, tests, and relevant Playwright checks before claiming completion.
- Update `IMPLEMENTATION_STATUS.md` and the requirements matrix after every phase.
- Do not ask for credentials inside prompts. Leave secure placeholders and exact connection instructions.
- Do not silently remove scope. Document any V2 deferral with rationale.
