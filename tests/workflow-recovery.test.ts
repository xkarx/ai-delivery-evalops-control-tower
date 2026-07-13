import { describe, expect, it } from "vitest";
import type { WorkflowAction } from "@dailycart/schemas";
import { shouldRecoverWorkflowAction } from "../apps/control-tower/lib/workflow-recovery";

function action(input: Partial<WorkflowAction> = {}): WorkflowAction {
  const now = new Date("2026-07-13T12:00:00.000Z").toISOString();
  return {
    actionId: "ACTION-TEST",
    sessionId: "SESSION-TEST",
    workflowId: "WORKFLOW-TEST",
    idempotencyKey: "SESSION-TEST:analyze:0",
    command: "analyze",
    executionMode: "showcase",
    status: "queued",
    phase: "queued",
    progress: 0,
    attempts: 0,
    message: "Queued",
    nextAction: "Wait",
    steps: [],
    externalRefs: [],
    createdAt: now,
    updatedAt: now,
    heartbeatAt: now,
    ...input
  };
}

describe("workflow recovery", () => {
  const now = Date.parse("2026-07-13T12:01:00.000Z");

  it("recovers a queued action whose hosted worker did not start", () => {
    expect(shouldRecoverWorkflowAction(action(), now)).toBe(true);
  });

  it("does not race a recently queued action", () => {
    expect(shouldRecoverWorkflowAction(action({ heartbeatAt: "2026-07-13T12:00:55.000Z" }), now)).toBe(false);
  });

  it("allows provider work a longer heartbeat window", () => {
    expect(shouldRecoverWorkflowAction(action({ status: "running", phase: "waiting_vercel", heartbeatAt: "2026-07-13T11:55:01.000Z" }), now)).toBe(false);
    expect(shouldRecoverWorkflowAction(action({ status: "running", phase: "waiting_vercel", heartbeatAt: "2026-07-13T11:53:59.000Z" }), now)).toBe(true);
  });

  it("never restarts settled actions", () => {
    expect(shouldRecoverWorkflowAction(action({ status: "waiting_human" }), now)).toBe(false);
    expect(shouldRecoverWorkflowAction(action({ status: "succeeded" }), now)).toBe(false);
    expect(shouldRecoverWorkflowAction(action({ status: "failed" }), now)).toBe(false);
  });
});
