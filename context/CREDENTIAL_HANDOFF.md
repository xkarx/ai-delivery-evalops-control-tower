# Credential Handoff

## Never place credentials in

- Codex prompts
- Markdown documentation
- Git commits
- synthetic data files
- screenshots or recorded demos

## Prefer

- OAuth/app installation for GitHub, Slack, and Linear
- Vercel project environment variables
- Supabase project secrets
- GitHub Actions secrets
- hosted worker/orchestrator secret settings
- short-lived and least-privilege credentials

## Codex environment note

Use non-secret environment variables for configuration. Treat API keys as secrets and follow current Codex environment behavior. The generated application should read live credentials from its deployment environment, while Codex can build and test mock adapters without them.

## Required health checks

Each live adapter must provide a safe read-only check before any write operation is enabled.
