# Deployment and Security

## Modes

### Demo mode
- No external credentials
- Mock adapters
- Generated company data
- Reproducible runs
- Clearly labeled mocked actions

### Connected mode
- Real GitHub, Slack, issue tracker, Supabase, Langfuse, PostHog, model API, and deployment provider

## Cloud-first requirement

The normal demo must not depend on the user's laptop remaining online. Host the control tower, worker, database, webhooks, and sample product where feasible.

## Cost controls

- Usage caps
- Traffic-duration limits
- Model budgets
- Rate limits
- Sample-product teardown
- Synthetic load disabled outside configured windows

## Security

- No committed secrets
- `.env.example`
- OAuth and least privilege
- Webhook signature verification
- Input validation
- Human approval for risky writes
- Audit external mutations
- Mask sensitive trace fields
- Secret scanning and dependency audit
- Revocation instructions
