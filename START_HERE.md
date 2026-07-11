# Start Here

## Recommended transfer method

Do not paste the brainstorming chat into Codex.

Use this repository pack as the durable source of truth:

1. Create a private GitHub repository, for example `ai-delivery-evalops-control-tower`.
2. Extract this pack into the repository root.
3. Commit and push all files.
4. Connect the repository to Codex.
5. Create a Codex cloud environment for the repository.
6. Start the first Codex task using `codex/ONE_SHOT_BUILD_PROMPT.md`.
7. Keep the build in demo/mock mode until live adapters exist.
8. Add credentials only through Codex/provider environment settings, never in chat or Git.
9. Use `MANUAL_CONNECTION_CHECKLIST.md` for the actions that remain yours.

## Why this works

- `AGENTS.md` gives Codex persistent operating rules.
- `MASTER_CONTEXT.md` preserves the complete product context.
- `context/` prevents requirements from being silently dropped.
- `tasks/` gives Codex an ordered build graph.
- `docs/` gives detailed system contracts.
- `.env.example` defines every expected connection without exposing secrets.
- `IMPLEMENTATION_STATUS.md` and the traceability matrix make completion auditable.

## What the user should do

Only:

- create or select accounts and workspaces
- authorize OAuth/app access
- enter secrets in secure environment settings
- choose repositories and deployment targets
- approve risky writes and final releases
- review the working demo and request improvements
