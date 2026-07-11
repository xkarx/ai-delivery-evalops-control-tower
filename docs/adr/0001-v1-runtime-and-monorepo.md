# ADR 0001: V1 runtime and monorepo

- Status: accepted
- Date: 2026-07-10

## Decision

V1 uses a pnpm TypeScript workspace with a Next.js control tower and framework-neutral packages for schemas, lineage, workflows, agents, evals, connectors, configuration, and the sample-product contract. JSON/JSONL/CSV fixtures are the credential-free demo store; Supabase implements the same normalized records in connected mode.

The V1 orchestration engine is local and serializable behind `WorkflowAdapter`. Its transitions, approval waits, retries, and event history execute in demo mode. A live Inngest adapter can replay the same command/event contract when configured. This prevents provider credentials from becoming a prerequisite for testing the lifecycle.

The control tower is deployable as one Next.js service. Provider mutations remain server-side and use normalized adapters. No secret is exposed through `NEXT_PUBLIC_*` except intentionally public project identifiers.

## Alternatives considered

- Turborepo was deferred because the V1 workspace is small and pnpm recursive scripts provide the required build graph without another runtime dependency.
- Direct provider SDK calls from pages were rejected because they couple demo availability to credentials and make audits inconsistent.
- A database-only demo was rejected because a fresh clone must execute without accounts or network access.

## Consequences

- Every provider needs mock and live implementations with the same contract.
- Demo artifacts are clearly labeled synthetic, simulated, or mocked and are schema validated.
- The live workflow and database adapters remain replaceable without rewriting agent, eval, or UI logic.
