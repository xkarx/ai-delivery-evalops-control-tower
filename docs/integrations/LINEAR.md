# Linear and GitHub Issues fallback

## Configuration

Set `LINEAR_API_KEY` and `LINEAR_TEAM_ID`. `LINEAR_WORKSPACE_ID` is optional metadata. A personal key is enough for a private demo; use Linear OAuth with least-privilege workspace authorization for a reusable deployment.

The live factory chooses Linear only when both required values exist. Otherwise it returns the GitHub Issues adapter backed by the configured GitHub code-host adapter. Mock mode always uses a deterministic in-memory issue tracker.

## Verification

Linear health executes the GraphQL query `viewer { id name }`, which is read-only. Ticket creation uses `issueCreate`; status transitions first read team workflow states and then use `issueUpdate`. External issue URLs come directly from Linear.

## Webhooks

Store the Linear signing secret as `LINEAR_WEBHOOK_SECRET` in the receiver. Give the exact raw body and `Linear-Signature` to `verifyLinearWebhook()`. The helper validates HMAC-SHA256 and rejects a `webhookTimestamp` more than one minute from the receiver clock.

References: https://linear.app/developers/graphql and https://linear.app/developers/webhooks
