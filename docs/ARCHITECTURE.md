# Architecture

## Suggested monorepo

```text
apps/
  control-tower/
  slack-app/
  worker/
packages/
  agents/
  skills/
  connectors/
  evals/
  lineage/
  schemas/
  ui/
  config/
company/
scripts/
docs/
tasks/
```

## Layers

1. Interaction: control tower and Slack
2. Workflow: orchestration and approval state
3. Agent runtime
4. Reusable skills
5. Connectors
6. Company files and Supabase
7. Eval engine and release gates
8. Langfuse observability
9. PostHog analytics
10. GitHub delivery and deployment

## Required adapters

- `IssueTrackerAdapter`
- `CodeHostAdapter`
- `ChatAdapter`
- `TraceAdapter`
- `ProductAnalyticsAdapter`
- `DatabaseAdapter`
- `DeploymentAdapter`
- `WorkflowAdapter`
- `SampleProductAdapter`

Each adapter must expose configuration status, health checks, mock behavior, live behavior, normalized errors, and external URLs.
