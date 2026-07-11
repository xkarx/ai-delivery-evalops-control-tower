# Vercel deployment connection

## Configuration

Set:

- `VERCEL_TOKEN`
- `VERCEL_PROJECT_ID`
- `VERCEL_ORG_ID` when the project belongs to a team
- optionally `VERCEL_PROJECT_SLUG`, `VERCEL_ORG_SLUG`, and `VERCEL_REPOSITORY_ID` for git deployments and cleaner links

Create a token scoped to the target account/project. Do not reuse a personal all-project token when a narrower deployment credential is available.

## Verification and teardown

Health calls `GET /v9/projects/{projectId}`. Deployments record feature ID, commit SHA, environment, provider ID, application URL, and Vercel URL. Production target selection is explicit.

Deletion requires both a deployment ID and `confirmation: "teardown-deployment"`; the request also carries a human-readable reason. The adapter rejects a missing or wrong confirmation before contacting Vercel.

Reference: https://vercel.com/docs/rest-api
