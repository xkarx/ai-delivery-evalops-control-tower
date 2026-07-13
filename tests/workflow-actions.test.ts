import { describe, expect, it } from "vitest";
import { newActionId, newSessionId, newWorkflowId } from "../apps/control-tower/lib/workflow-actions";

describe("durable workflow identity", () => {
  it("creates distinct schema-safe IDs for sessions, workflows, and actions", () => {
    const sessions = new Set(Array.from({ length: 100 }, () => newSessionId()));
    const workflows = new Set(Array.from({ length: 100 }, () => newWorkflowId()));
    const actions = new Set(Array.from({ length: 100 }, () => newActionId()));

    expect(sessions.size).toBe(100);
    expect(workflows.size).toBe(100);
    expect(actions.size).toBe(100);
    expect([...sessions].every((id) => /^SESSION-\d+[A-Z0-9]{12}$/.test(id))).toBe(true);
    expect([...workflows].every((id) => /^WORKFLOW-\d+[A-Z0-9]{12}$/.test(id))).toBe(true);
    expect([...actions].every((id) => /^ACTION-[A-Z0-9]{12}$/.test(id))).toBe(true);
  });
});
