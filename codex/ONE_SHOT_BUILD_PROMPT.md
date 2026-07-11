You are the lead engineer and implementation orchestrator for this repository. Build the complete V1 described by the repository context. Do not stop after producing a plan.

Before writing code, read in this order:

1. `AGENTS.md`
2. `CONTEXT_INDEX.md`
3. `MASTER_CONTEXT.md`
4. every file under `context/`
5. every file under `docs/`
6. `tasks/MASTER_BUILD_PLAN.md` and all phase files
7. `references/REFERENCES.md`
8. the current repository tree

Then perform the work:

- Create a requirements-to-work graph using the IDs in `context/REQUIREMENTS_TRACEABILITY.md`.
- Initialize or complete the recommended monorepo and architecture.
- Execute Phase 00 through Phase 08 in dependency order.
- Use subagents or parallel tasks for independent workstreams when available, while avoiding conflicting edits.
- Continue implementing rather than waiting for external credentials.
- For every provider, create a normalized adapter, a working mock implementation, a live implementation scaffold, health checks, setup instructions, and visual connection status.
- Keep `DEMO_MODE=synthetic` working throughout.
- Generate all synthetic company data, analytics fixtures, support data, interviews, incidents, eval datasets, rubrics, and seed scripts. Make generation deterministic and validate all cross-file identifiers.
- Build the visual control tower, feature lineage, agent activity, EvalOps, human review, deployment, incident, analytics, company data, and integration-health interfaces.
- Implement real workflow state, approvals, agent execution, traces, tests, evals, and release gates. Do not invent successful results.
- Do not hardcode the feature recommendation. The PM agent must analyze the generated evidence.
- Implement at least two independent workstreams and one deliberate eval failure that blocks release, followed by correction and rerun.
- Reuse open-source code only after license review. Record every reused or adapted component in `references/OPEN_SOURCE_ATTRIBUTION.md`.
- Never commit credentials or ask for them in chat. Maintain `.env.example` and `MANUAL_CONNECTION_CHECKLIST.md`.
- Where a live integration cannot be verified without authorization, finish the code and tests using the mock adapter, then add the exact smallest manual connection step to the checklist.
- Add automated tests, Playwright coverage, CI, demo reset, demo run, deployment and teardown scripts, architecture diagrams, screenshots, setup documentation, troubleshooting, and release notes.
- Update `IMPLEMENTATION_STATUS.md` and `context/REQUIREMENTS_TRACEABILITY.md` after every phase.
- Create reviewable commits or pull requests by phase when supported.

Definition of completion:

- A fresh clone can run the full demo without external credentials.
- Adding provider credentials activates real integrations without rewriting core code.
- The complete evidence-to-production lineage is visible.
- A real failed eval blocks a release and a corrected run passes.
- The sample product, generated traffic, product analytics, agent traces, GitHub delivery, approvals, deployment, and feedback loop are connected.
- The only remaining user actions are listed in `MANUAL_CONNECTION_CHECKLIST.md`.

Start immediately with repository inspection and Phase 00. Make reasonable documented assumptions rather than asking broad questions already answered in the repository.
