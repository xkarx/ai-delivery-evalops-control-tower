import type { IntegrationHealth } from "@dailycart/schemas";
import { BaseConnector } from "../base";
import { ConnectorError } from "../errors";
import { jsonHeaders, requestJson } from "../http";
import type {
  AdapterRuntime,
  ApprovalMessageInput,
  ChatAdapter,
  ChatMessageInput,
  ChatMessageRecord
} from "../types";

interface SlackResponse {
  ok: boolean;
  error?: string;
  channel?: string;
  ts?: string;
  team_id?: string;
  url?: string;
  user?: string;
}

function normalizeSlackMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  if (typeof metadata.event_type === "string" && metadata.event_payload !== undefined) return metadata;
  return { event_type: "dailycart_message", event_payload: metadata };
}

export class MockSlackChatAdapter extends BaseConnector implements ChatAdapter {
  readonly kind = "chat" as const;
  readonly provider = "slack" as const;
  protected readonly requiredEnvironment: string[] = [];
  protected readonly capabilities = ["messages", "threads", "approvals", "alerts", "webhooks"];
  private readonly messages: ChatMessageRecord[] = [];

  constructor(runtime: AdapterRuntime = {}) {
    super("mock", runtime);
  }

  externalUrl(resource = ""): string {
    return `https://app.slack.com/client/TMOCK${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.healthy("Mock Slack workspace is ready.", this.externalUrl());
  }

  async postMessage(input: ChatMessageInput): Promise<ChatMessageRecord> {
    const channel = input.channel ?? this.env.SLACK_DEFAULT_CHANNEL ?? "CDAILYCART";
    const sequence = this.messages.length + 1;
    const threadId = input.threadId ?? `1700000000.${String(sequence).padStart(6, "0")}`;
    const record: ChatMessageRecord = {
      provider: "slack",
      externalId: threadId,
      channel,
      threadId,
      text: input.text,
      url: this.externalUrl(`${channel}/${threadId.replace(".", "")}`),
      sourceMode: "mocked"
    };
    this.messages.push(record);
    return record;
  }

  async requestApproval(input: ApprovalMessageInput): Promise<ChatMessageRecord> {
    return this.postMessage({
      channel: input.channel,
      text: `${input.title}\n${input.detail}`,
      metadata: { approvalId: input.approvalId },
      blocks: approvalBlocks(input)
    });
  }

  listMessages(): readonly ChatMessageRecord[] {
    return this.messages;
  }
}

function approvalBlocks(input: ApprovalMessageInput): unknown[] {
  return [
    { type: "header", text: { type: "plain_text", text: input.title } },
    { type: "section", text: { type: "mrkdwn", text: input.detail } },
    {
      type: "actions",
      block_id: `approval:${input.approvalId}`,
      elements: [
        { type: "button", text: { type: "plain_text", text: input.approveLabel ?? "Approve" }, style: "primary", action_id: "approval_approve", value: input.approvalId },
        { type: "button", text: { type: "plain_text", text: input.rejectLabel ?? "Reject" }, style: "danger", action_id: "approval_reject", value: input.approvalId }
      ]
    }
  ];
}

export class LiveSlackChatAdapter extends BaseConnector implements ChatAdapter {
  readonly kind = "chat" as const;
  readonly provider = "slack" as const;
  protected readonly requiredEnvironment = ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET", "SLACK_DEFAULT_CHANNEL"];
  protected readonly capabilities = ["messages", "threads", "approvals", "alerts", "webhooks"];
  private readonly apiBase: string;
  private teamId?: string;

  constructor(runtime: AdapterRuntime = {}) {
    super("live", runtime);
    this.apiBase = (this.env.SLACK_API_URL ?? "https://slack.com/api").replace(/\/$/, "");
  }

  externalUrl(resource = ""): string {
    const team = this.teamId ?? this.env.SLACK_TEAM_ID ?? "T00000000";
    return `https://app.slack.com/client/${team}${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  private async call(method: string, body: Record<string, unknown> = {}): Promise<SlackResponse> {
    this.assertConfigured();
    const response = await requestJson<SlackResponse>(`${this.apiBase}/${method}`, {
      provider: this.provider,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      method: "POST",
      headers: jsonHeaders({ authorization: `Bearer ${this.env.SLACK_BOT_TOKEN}` }),
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const unauthorized = new Set(["invalid_auth", "not_authed", "token_expired", "token_revoked"]);
      throw new ConnectorError({
        provider: this.provider,
        code: unauthorized.has(response.error ?? "") ? "UNAUTHORIZED" : response.error === "ratelimited" ? "RATE_LIMITED" : "PROVIDER_ERROR",
        retryable: response.error === "ratelimited" || response.error === "internal_error",
        message: `Slack ${method} failed: ${response.error ?? "unknown_error"}`
      });
    }
    return response;
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.safeHealth(async () => {
      const response = await this.call("auth.test");
      this.teamId = response.team_id;
      return `Authenticated Slack bot ${response.user ?? "unknown"}.`;
    }, this.externalUrl());
  }

  async postMessage(input: ChatMessageInput): Promise<ChatMessageRecord> {
    const channel = input.channel ?? (this.env.SLACK_DEFAULT_CHANNEL as string);
    const response = await this.call("chat.postMessage", {
      channel,
      text: input.text,
      thread_ts: input.threadId,
      blocks: input.blocks,
      metadata: normalizeSlackMetadata(input.metadata)
    });
    const threadId = response.ts as string;
    return {
      provider: "slack",
      externalId: threadId,
      channel: response.channel ?? channel,
      threadId,
      text: input.text,
      url: this.externalUrl(`${response.channel ?? channel}/${threadId.replace(".", "")}`),
      sourceMode: "live"
    };
  }

  async requestApproval(input: ApprovalMessageInput): Promise<ChatMessageRecord> {
    return this.postMessage({
      channel: input.channel,
      text: `${input.title}\n${input.detail}`,
      metadata: { event_type: "dailycart_approval", event_payload: { approvalId: input.approvalId } },
      blocks: approvalBlocks(input)
    });
  }
}

export function createChatAdapter(runtime: AdapterRuntime = {}): ChatAdapter {
  return (runtime.env ?? process.env).INTEGRATION_MODE === "live"
    ? new LiveSlackChatAdapter(runtime)
    : new MockSlackChatAdapter(runtime);
}
