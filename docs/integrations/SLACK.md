# Slack connection

## Configuration

Create a Slack app, install it to the intended workspace, and store:

- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `SLACK_DEFAULT_CHANNEL` as a channel ID, not a display name
- optionally `SLACK_TEAM_ID` for deep links

For V1, grant `chat:write`. Add channel/history scopes only when a workflow genuinely reads those resources. Invite the bot to the configured channel.

## Verification

The health check calls Slack's read-only `auth.test` method. Approval requests use `chat.postMessage` with explicit approve/reject action IDs and the stable approval ID in action metadata.

For Events API and interactive actions, read the raw request body before any JSON/form middleware. Call `verifySlackWebhook()` with `X-Slack-Signature`, `X-Slack-Request-Timestamp`, and the signing secret. The helper uses timing-safe HMAC comparison and rejects timestamps older than five minutes.

References: https://api.slack.com/methods/auth.test and https://api.slack.com/docs/verifying-requests-from-slack
