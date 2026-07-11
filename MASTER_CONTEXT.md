# Master Context

## Product

Build an open-source **AI Product Delivery and EvalOps Control Tower**.

It must demonstrate product management, technical program management, AI operations, evaluation operations, human-in-the-loop decision-making, agent orchestration, software delivery, release management, observability, reliability, and production feedback.

The lifecycle is:

`Signals → synthesis → feature ideas → prioritization → approval → PRD → tickets → agent planning → parallel implementation → pull requests → tests and evals → preview → release decision → deployment → product outcomes → incidents/failures → new evidence and eval cases`

EvalOps is the strongest subsystem, but it does not replace the rest of the end-to-end lifecycle.

## V1 result

A reviewer must be able to see:

1. A functioning sample product
2. Structured company context
3. Generated traffic and product events
4. A PM agent genuinely analyzing evidence and brainstorming features
5. Human approval
6. Tickets and an execution plan
7. Engineering agents creating real code changes and pull requests
8. Real tests and evals
9. A failed gate blocking release
10. A corrected version passing
11. A preview or deployment
12. A visual control tower linking the complete history
13. Production failures becoming new eval cases

## V1 scope

- One default sample product
- One generated company scenario
- GitHub engineering workflow
- Slack interaction and approvals
- Linear integration with GitHub Issues fallback
- Supabase shared state and lineage
- Langfuse traces, datasets, and scores
- PostHog analytics
- GitHub Actions checks and release gates
- Custom control tower
- Deterministic data generator
- Mock adapters without credentials
- Live adapters after credentials
- Setup wizard or clear setup workflow
- Health checks and demo reset

## V2 scope

- Connect arbitrary repositories
- Automatic repository analysis
- Multiple framework and deployment adapters
- Multi-tenant permissions
- Durable production queues
- Advanced reviewer calibration
- Staged rollout and rollback
- Connector/plugin SDK

## Sample product

Default candidate: Google Online Boutique  
Repository: https://github.com/GoogleCloudPlatform/microservices-demo

It supplies a product catalogue, search, cart, checkout, mock payment, shipping, email, recommendations, multiple services, and a Locust load generator.

It does not supply company strategy, customer interviews, support tickets, historical analytics, PM workflows, agent workflows, EvalOps, or the control tower. Those are created by this project.

The platform must use a `SampleProductAdapter` so a different application can replace it later.

## Fictional company

Create a coherent fictional commerce company, provisionally called **DailyCart**.

Generate:

- Company overview, strategy, and quarterly goals
- Personas and persistent customer accounts
- Interview transcripts and summaries
- Surveys, support tickets, feature requests, and bugs
- Slack-style discussions
- Roadmap, backlog, decisions, and release history
- Incidents and postmortems
- Analytics event schema, funnels, baselines, and experiments
- Eval datasets, rubrics, and expected labels

The data must contain discoverable patterns, uncertainty, noise, and conflicting signals. Do not hardcode the recommended feature. The PM agent must derive recommendations from evidence.

## Synthetic versus real

Synthetic:

- Company history
- Customer identities
- Interviews
- Support records
- Roadmap
- Incidents
- Baseline business metrics

Real execution:

- Data generation scripts
- Simulated traffic
- Analytics events
- Model and agent calls
- Retrieval and tool calls
- Traces
- Approvals
- Issues, branches, pull requests, and checks
- Evals
- Release decisions
- Workflow state
- Dashboard updates

Always label synthetic, simulated, generated, mocked, and live data accurately.

## Agents

### PM agent
Synthesize research and analytics, identify problems, brainstorm opportunities, prioritize features, draft PRDs, define metrics and acceptance criteria, and cite evidence IDs.

### TPM agent
Create plans, dependencies, risks, milestones, ownership, readiness checks, status reports, decisions, and escalations.

### Engineering agent
Inspect the repository, plan implementation, work in an isolated branch or worktree, modify code, add tests, and open a pull request.

### Eval agent
Create and version eval cases, apply deterministic graders and AI judges, collect human review, classify failures, compare versions, and recommend pass/block/escalate.

### Release agent
Verify checks, create or inspect previews, prepare release notes, request approval, deploy, and record rollout decisions.

### Incident agent
Capture failures, classify root causes, create regression tests, assign follow-ups, and track postmortems.

## Skills

Skills are reusable procedures, separate from agent identities. Every skill must define inputs, required context, allowed tools, procedure, outputs, approval points, failure behavior, and eval criteria.

Required skills:

- Interview synthesis
- Support-ticket clustering
- Analytics anomaly analysis
- Opportunity generation
- Feature prioritization
- PRD generation
- Ticket decomposition
- Dependency mapping
- Implementation planning
- Code implementation
- Pull-request preparation
- Eval-case generation
- Rubric authoring
- Release readiness
- Incident-to-regression conversion

## Tools and roles

- GitHub: code, issues, branches, PRs, CI, deployments, releases
- Slack: commands, questions, approvals, alerts, status
- Linear: roadmap, projects, tickets, dependencies
- Supabase: shared state, entities, external references, and lineage
- Langfuse: prompts, traces, retrieval, tool calls, datasets, experiments, scores, cost, latency
- PostHog: events, funnels, adoption, segments, experiments, optional feature flags
- GitHub Actions: tests and release gates
- Inngest for V1 orchestration, behind an adapter
- Vercel or equivalent for the control tower
- A suitable cloud target for the sample product

## Visual system

Required pages:

- Overview
- Feature portfolio
- Feature lineage
- Agent runs
- Eval campaigns
- Human review
- Deployments and releases
- Incidents
- Product analytics
- Company data
- Integration health
- Settings

Required visuals:

- Feature cards and Kanban
- End-to-end timeline
- Agent activity stream and trace tree
- Dependency graph
- Eval score matrix
- Human-versus-AI agreement
- Failure taxonomy
- Product funnel
- Release gate checklist
- Incident timeline
- Cost and latency trends
- Integration health cards

Every summary should link to evidence or the external provider.

## Traceability

Use stable IDs:

- `EVD-0001`
- `CUS-0001`
- `FEAT-0001`
- `DEC-0001`
- `TKT-0001`
- `RUN-0001`
- `EVAL-0001`
- `DEP-0001`
- `INC-0001`

The control tower must connect evidence, recommendations, decisions, PRDs, tickets, runs, PRs, evals, deployments, incidents, and product outcomes.

## EvalOps

Required capabilities:

- Eval request intake
- Dataset creation and versioning
- Instructions and rubrics
- Deterministic graders
- AI judges
- Human review
- Judge calibration against human labels
- Agent/model/prompt comparison
- Quality/cost/latency tradeoffs
- CI release gates
- Production-failure ingestion
- Failure taxonomy
- Incident-to-regression workflow

PM evals include evidence grounding, unsupported claims, problem understanding, duplicate avoidance, prioritization quality, feasibility, metrics, and testable acceptance criteria.

Engineering evals include build, unit/integration/Playwright tests, regression safety, scope adherence, secret scanning, dependency safety, and requirement coverage.

Trajectory evals include tool choice, context retrieval, approval compliance, retries, escalation, task completion, cost, and latency.

A release is blocked when a critical deterministic check or safety check fails, the score is below threshold, or required approval is missing.

## Demonstration scenario

1. Load the generated company
2. Generate traffic and analytics
3. PM agent identifies multiple opportunities
4. Human approves a feature and a bug fix
5. TPM agent creates plan and dependencies
6. Tickets are created
7. Two workstreams execute
8. One passes and one fails an eval
9. The release is blocked
10. The agent corrects the issue
11. Evals rerun and pass
12. Preview is approved
13. Deployment and GitHub release are recorded
14. Product events show use
15. A simulated production failure becomes a regression case

## Reuse

Do not rebuild mature infrastructure without reason. Review Google Online Boutique, OpenTelemetry Demo, Cyrus, OpenHands, Langfuse, and relevant PM operating-system patterns. Verify licenses, preserve attribution, and record copied versus adapted versus newly written code.

## Credentials

Before credentials exist:

- Build provider interfaces and mocks
- Generate `.env.example`
- Create setup docs and health checks
- Keep the complete demo runnable

After credentials are supplied:

- Activate live adapters
- Verify connections
- Store secrets only in provider secret stores
- Never commit them or require them in a normal prompt

The user should mainly create accounts, approve OAuth, enter secrets securely, choose repositories/workspaces, and approve releases.

## Definition of done

V1 is complete only when a fresh clone can run demo mode, regenerate valid synthetic data, execute a PM workflow, pause for approval, create delivery artifacts, run real tests and evals, block a bad release, pass after correction, link a deployment, display trace and analytics integrations when configured, and show the full lineage visually.
