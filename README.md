# DailyCart Delivery OS — AI Product Delivery & EvalOps Control Tower

DailyCart is a visual control tower for taking a product signal from discovery to a safe release. It makes the delivery chain inspectable: evidence → opportunity → product decision → technical delivery plan → implementation → evaluation → human approval → deployment → production feedback. The sample product is DailyCart Commerce, an intentionally deterministic synthetic e-commerce company modeled on the Google Online Boutique scenario.

This is an operating system demo, not a static dashboard. The synthetic fixtures are real, schema-validated records with stable IDs and lineage. Running the workflow executes agents, writes state, evaluates gates, and pauses for approval. When connected credentials are supplied, provider adapters perform live read/write calls; without them, the same contracts run safely in deterministic demo mode.

## The responsibility model

- **PM** retrieves and clusters customer evidence, ranks the opportunity, and drafts the PRD.
- **TPM** receives the PM-approved delivery scope, decomposes it into workstreams, maps dependencies and risks, and prepares delivery readiness. TPM has no PRD authoring or review responsibility.
- **Engineering** implements tickets and records tests and telemetry requirements.
- **EvalOps** runs deterministic and (when configured) model-judged evals and blocks critical regressions.
- **Human review** approves the feature and release gates.
- **Release** deploys the approved change and syncs external delivery records.
- **Incident** converts production feedback into a linked regression case.

## Start here

1. `AGENTS.md`
2. `CONTEXT_INDEX.md`
3. `MASTER_CONTEXT.md`
4. `context/NON_NEGOTIABLES.md`
5. `context/REQUIREMENTS_TRACEABILITY.md`
6. `tasks/MASTER_BUILD_PLAN.md`

## Run the completed V1

```bash
corepack pnpm install
corepack pnpm demo
corepack pnpm dev
```

The demo works without credentials. It generates deterministic DailyCart data, executes the PM/TPM/engineering/EvalOps lifecycle, demonstrates a blocked critical gate followed by a corrected passing rerun, and serves the responsive control tower at `http://localhost:3000`.

## A complete demo flow

1. Open **Company data**. Select a collection or evidence row to preview the synthetic transcript, support signal, analytics note, and its linked feature/lineage.
2. Open **Overview** and follow the **Demo Guide**. Start from company context, then choose **Run demo**. Watch the workflow rank two feature tracks and move from context retrieval through PM synthesis, UX review, engineering-feasibility review, TPM delivery planning, parallel engineering, preview evals, and the release gates.
3. Open **Agent runs** to inspect each run and its step-level evidence. TPM consumes the PM-owned brief and only plans workstreams, dependencies, risks, and readiness. Use the Follow-along console to see the current phase, next action, and ask a contextual question.
4. Open **Eval campaigns**. The first campaign intentionally blocks on a critical regression; the corrected campaign passes. This demonstrates why a weighted score alone cannot override a critical failure.
5. Use **Human review** to approve the pending release, then **Deployments** to record the release and **Incidents** to see how production feedback becomes a regression case.
6. Use the **operator command** panel or Slack `/dailycart` command for `run workflow`, `approve release`, `create ticket: ...`, `sync delivery`, and `status`. Every command returns visible success/error feedback and updates the local workflow state.
7. Click **Build product preview** from the workflow action. Both feature tracks create isolated GitHub branches, commits, PRs, and Vercel previews. Preview evals run against each target before release approval. In demo mode the same normalized records are deterministic and clearly labeled as fallback.

### Where each connected tool appears

| Tool | V1 action | What it demonstrates |
|---|---|---|
| Linear (or GitHub Issues fallback) | **Sync delivery records** creates the three delivery tickets | Structured decomposition, dependencies, and external traceability |
| Slack | One bot fans handoffs into delivery, approvals, alerts, and analytics channels; slash commands work in each | Human-in-the-loop coordination and command-driven automation |
| GitHub | Repository health, issue fallback, branches/PR/check/release links | Code-host integration and isolated engineering work |
| Langfuse | Sync creates a delivery trace and `workflow_completed` score | Agent observability, lineage, and outcome scoring |
| PostHog | Product interactions and bounded traffic are captured | Funnel, exposure, failure, and adoption measurement |
| Supabase | Workflow records and lineage can be persisted through the adapter | Durable shared state and external references |
| Inngest | Sync emits `dailycart/workflow.completed` | Event-driven orchestration boundary |
| Vercel | Approved release calls the deployment adapter | Release gating and deployment evidence |
| DailyCart sample product | Analytics → Traffic controls generates capped activity | A controllable product surface rather than a screenshot |

After **Sync delivery records**, the UI exposes the actual ticket, Slack message, Langfuse trace, and Inngest event links. In live mode those links point to the connected provider; in demo mode they point to deterministic adapter records and are labeled as mocked.

## Live mode versus demo mode

`DEMO_MODE=synthetic` is deliberately credential-free. It is useful for a repeatable product demo and still executes the workflow locally. Set `INTEGRATION_MODE=live` and provide provider secrets in the deployment secret store to use GitHub, Slack, Linear, Supabase, Langfuse, PostHog, Vercel, Inngest, and the sample-product traffic adapter. Set `DAILYCART_OPERATOR_PASSCODE` so live writes and model credits require an operator session. Configure `SLACK_DELIVERY_CHANNEL`, `SLACK_APPROVALS_CHANNEL`, `SLACK_ALERTS_CHANNEL`, and `SLACK_ANALYTICS_CHANNEL` for multi-channel fan-out. The Integrations page runs read-only health probes on load and on **Check all**; each provider card shows its actual mode, configuration, write capability, and missing variables.

Company evidence remains synthetic by design in V1. “Live” means the delivery workflow and provider side effects are live; it does not invent access to private customer research. The sample product traffic endpoint lets you generate bounded, repeatable traffic against the product contract and observe funnel analytics.

## Deployment

The production app is the `apps/control-tower` workspace. In Vercel, set the project root to `apps/control-tower`, use `pnpm --filter @dailycart/control-tower build`, and add the variables listed in `MANUAL_CONNECTION_CHECKLIST.md`. Vercel automatically creates a new deployment after a push to `main`. Never commit `.env.local` or provider secrets.

## V2 boundary

V1 intentionally stops at a single synthetic company, one release gate, and adapter-backed provider actions. V2 can add multi-company tenancy, a durable external evidence store, richer Slack conversational threads, background job orchestration, and configurable load-test scenarios. Those are extensions, not substitutes for the V1 flow above.

Useful checks:

```bash
corepack pnpm validate:data
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:e2e
corepack pnpm security:scan
```

See `docs/DEMO_RUNBOOK.md`, `docs/TROUBLESHOOTING.md`, and `MANUAL_CONNECTION_CHECKLIST.md` for connected-mode setup.

For a new Codex task, paste `codex/INITIAL_PROMPT.md`.
