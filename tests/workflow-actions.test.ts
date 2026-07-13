import { describe, expect, it } from "vitest";
import { clearArtifact, readArtifact, writeArtifact } from "../apps/control-tower/lib/durable-artifacts";
import { decodeSessionCookie, encodeSessionCookie, requestSessionId } from "../apps/control-tower/lib/demo-session";
import { createWorkflowAction, newActionId, newSessionId, newWorkflowId, readActions } from "../apps/control-tower/lib/workflow-actions";

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

  it("signs the browser session and rejects a modified cookie", () => {
    const sessionId = newSessionId();
    const cookie = encodeSessionCookie(sessionId);

    expect(decodeSessionCookie(cookie)).toBe(sessionId);
    expect(decodeSessionCookie(`${cookie}changed`)).toBeUndefined();
    expect(requestSessionId(new Request("https://dailycart.test/demo", { headers: { cookie: `dailycart_demo_session=${cookie}` } }))).toBe(sessionId);
  });

  it("isolates durable records by session", async () => {
    const first = newSessionId();
    const second = newSessionId();
    try {
      await writeArtifact("workflow", { marker: "first" }, first);
      await writeArtifact("workflow", { marker: "second" }, second);

      expect(await readArtifact("workflow", first)).toEqual({ marker: "first" });
      expect(await readArtifact("workflow", second)).toEqual({ marker: "second" });
    } finally {
      await clearArtifact("workflow", first);
      await clearArtifact("workflow", second);
    }
  });

  it("deduplicates repeated commands only inside the same session and revision", async () => {
    const first = newSessionId();
    const second = newSessionId();
    try {
      const a = await createWorkflowAction({ command: "analyze", sessionId: first, workflowId: newWorkflowId(), revision: 0 });
      const repeated = await createWorkflowAction({ command: "analyze", sessionId: first, workflowId: a.action.workflowId, revision: 0 });
      const otherSession = await createWorkflowAction({ command: "analyze", sessionId: second, workflowId: newWorkflowId(), revision: 0 });

      expect(repeated.reused).toBe(true);
      expect(repeated.action.actionId).toBe(a.action.actionId);
      expect(otherSession.reused).toBe(false);
      expect(otherSession.action.actionId).not.toBe(a.action.actionId);
      expect(Object.keys(await readActions(first))).toEqual([a.action.actionId]);
    } finally {
      await clearArtifact("workflowActions", first);
      await clearArtifact("workflowActions", second);
    }
  });
});
