import type { ChatAdapter, ChatMessageRecord } from "./types";

/**
 * The normalized handoff contract used by the workflow, Slack, and the
 * control-tower activity stream. Keeping this shape provider-neutral means
 * mock mode produces the same conversation structure as live Slack mode.
 */
export interface AgentHandoffMessage {
  id: string;
  workflowId: string;
  persona: string;
  role: string;
  task: string;
  evidenceIds: string[];
  result: string;
  nextAction: string;
  status: "queued" | "in_progress" | "succeeded" | "blocked" | "waiting_approval";
  sourceMode: "mocked" | "live";
}

export interface AgentHandoffThreadResult {
  workflowId: string;
  messages: ChatMessageRecord[];
  sourceMode: "mocked" | "live";
  threadId?: string;
}

function formatHandoff(message: AgentHandoffMessage): string {
  const evidence = message.evidenceIds.length > 0 ? message.evidenceIds.join(", ") : "none";
  return [
    `*${message.persona}* · ${message.role}`,
    `*Task:* ${message.task}`,
    `*Evidence:* ${evidence}`,
    `*Result:* ${message.result}`,
    `*Next action:* ${message.nextAction}`,
    `*Status:* ${message.status}`
  ].join("\n");
}

/** Post one Slack message per logical persona as a single threaded handoff. */
export async function postAgentHandoffThread(
  chat: ChatAdapter,
  handoffs: readonly AgentHandoffMessage[],
  options: { channel?: string; title?: string; threadId?: string } = {}
): Promise<AgentHandoffThreadResult> {
  if (handoffs.length === 0) {
    throw new Error("At least one agent handoff is required");
  }

  let threadId: string | undefined = options.threadId;
  const records: ChatMessageRecord[] = [];
  for (const handoff of handoffs) {
    const record = await chat.postMessage({
      channel: options.channel,
      threadId,
      text: `${options.title && !threadId ? `*${options.title}*\n` : ""}${formatHandoff(handoff)}`,
      metadata: {
        source: "dailycart-agent-handoff",
        workflowId: handoff.workflowId,
        handoffId: handoff.id,
        persona: handoff.persona,
        status: handoff.status,
        evidenceIds: handoff.evidenceIds
      }
    });
    records.push(record);
    threadId ??= record.threadId;
  }

  return {
    workflowId: handoffs[0]!.workflowId,
    messages: records,
    sourceMode: records[0]!.sourceMode,
    threadId
  };
}
