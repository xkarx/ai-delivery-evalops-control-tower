import { describe, expect, it } from "vitest";
import { LiveSlackChatAdapter, MockSlackChatAdapter, postAgentHandoffFanout, postAgentHandoffThread } from "../packages/connectors/src/index";

describe("agent handoff threads", () => {
  it("posts one deterministic message per persona in a single thread", async () => {
    const chat = new MockSlackChatAdapter({ env: { INTEGRATION_MODE: "mock", SLACK_DEFAULT_CHANNEL: "CDAILYCART" } });
    const result = await postAgentHandoffThread(chat, [
      {
        id: "WF-1:pm", workflowId: "WF-1", persona: "PM agent", role: "Product manager",
        task: "Cluster evidence", evidenceIds: ["EVD-0001"], result: "Selected feature", nextAction: "Hand to TPM", status: "succeeded", sourceMode: "mocked"
      },
      {
        id: "WF-1:tpm", workflowId: "WF-1", persona: "TPM agent", role: "Technical program manager",
        task: "Plan delivery", evidenceIds: ["FEAT-0001"], result: "Planned two tickets", nextAction: "Start engineering", status: "succeeded", sourceMode: "mocked"
      }
    ], { title: "DailyCart workflow WF-1" });

    expect(result.sourceMode).toBe("mocked");
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.threadId).toBe(result.messages[1]?.threadId);
    expect(result.messages[0]?.text).toContain("PM agent");
    expect(result.messages[1]?.text).toContain("TPM agent");
  });

  it("wraps arbitrary message metadata in Slack's event envelope", async () => {
    let payload: Record<string, unknown> | undefined;
    const chat = new LiveSlackChatAdapter({
      env: { INTEGRATION_MODE: "live", SLACK_BOT_TOKEN: "xoxb-test", SLACK_SIGNING_SECRET: "secret", SLACK_DEFAULT_CHANNEL: "CDAILYCART" },
      fetch: async (_input, init) => {
        payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ ok: true, channel: "CDAILYCART", ts: "1700000000.000001" }), { status: 200 });
      }
    });

    await chat.postMessage({ text: "handoff", metadata: { workflowId: "WF-1", persona: "PM agent" } });
    expect(payload?.metadata).toEqual({ event_type: "dailycart_message", event_payload: { workflowId: "WF-1", persona: "PM agent" } });
  });

  it("mirrors one workflow into configured operational channels", async () => {
    const chat = new MockSlackChatAdapter({ env: { INTEGRATION_MODE: "mock", SLACK_DEFAULT_CHANNEL: "CDAILYCART" } });
    const handoff = { id: "WF-2:pm", workflowId: "WF-2", persona: "PM agent", role: "Product manager", task: "Cluster evidence", evidenceIds: ["EVD-0001"], result: "Selected feature", nextAction: "Request approval", status: "succeeded" as const, sourceMode: "mocked" as const };
    const result = await postAgentHandoffFanout(chat, [handoff], { delivery: "CDELIVERY", approvals: "CAPprovals", alerts: "CALERTS", analytics: "CANALYTICS" }, "DailyCart workflow WF-2");
    expect(Object.keys(result.channels)).toHaveLength(4);
    expect(new Set(Object.values(result.channels).map((channel) => channel.messages[0]?.channel)).size).toBe(4);
  });
});
