import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  verifyGitHubWebhook,
  verifyLinearWebhook,
  verifySlackWebhook
} from "../packages/connectors/src/index";

describe("webhook verification", () => {
  it("verifies GitHub SHA-256 signatures with the raw body", () => {
    const body = JSON.stringify({ action: "opened", number: 42 });
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;

    expect(verifyGitHubWebhook(body, signature, "secret")).toBe(true);
    expect(verifyGitHubWebhook(`${body} `, signature, "secret")).toBe(false);
    expect(verifyGitHubWebhook(body, "sha1=legacy", "secret")).toBe(false);
  });

  it("verifies Slack signatures and rejects replayed timestamps", () => {
    const nowMs = 1_750_000_000_000;
    const timestamp = String(Math.floor(nowMs / 1_000));
    const rawBody = "payload=%7B%22type%22%3A%22block_actions%22%7D";
    const signature = `v0=${createHmac("sha256", "slack-secret").update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;

    expect(verifySlackWebhook({ rawBody, timestamp, signature, signingSecret: "slack-secret", nowMs })).toBe(true);
    expect(verifySlackWebhook({ rawBody, timestamp, signature, signingSecret: "slack-secret", nowMs: nowMs + 301_000 })).toBe(false);
  });

  it("verifies Linear signatures and one-minute replay tolerance", () => {
    const nowMs = 1_750_000_000_000;
    const rawBody = JSON.stringify({ type: "Issue", webhookTimestamp: nowMs });
    const signature = createHmac("sha256", "linear-secret").update(rawBody).digest("hex");

    expect(verifyLinearWebhook({ rawBody, signature, signingSecret: "linear-secret", nowMs })).toBe(true);
    expect(verifyLinearWebhook({ rawBody, signature, signingSecret: "linear-secret", nowMs: nowMs + 60_001 })).toBe(false);
  });
});
