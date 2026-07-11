# GitHub connection

## Configuration

Set `GITHUB_DEFAULT_REPOSITORY=owner/repository`, then choose one authentication path:

1. GitHub App: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_INSTALLATION_ID`.
2. Short-lived installation token: `GITHUB_INSTALLATION_TOKEN`.
3. Development-only fine-grained token: `GITHUB_TOKEN`.

The app path exchanges a signed app JWT for an installation token and caches it only in memory. Install the app only on the selected repository. Grant repository metadata read, contents read/write, issues read/write, pull requests read/write, checks read, actions read, and deployments/releases read/write only if those mutations are enabled.

## Verification

The health check calls `GET /repos/{owner}/{repository}`. It does not create an issue, branch, pull request, check, deployment, or release. A successful check links to `https://github.com/{owner}/{repository}`.

## Webhooks

Set `GITHUB_WEBHOOK_SECRET` in the receiver's secret store. Pass the exact raw request bytes and `X-Hub-Signature-256` header to `verifyGitHubWebhook()`. Reject missing, legacy SHA-1, or mismatched signatures before parsing the payload. Subscribe only to the events used by the control tower, such as issues, pull requests, check runs, workflow runs, deployments, and releases.

API reference: https://docs.github.com/en/rest
