import { describe, expect, it } from "vitest";
import { clearArtifact, readArtifact, writeArtifact } from "../apps/control-tower/lib/durable-artifacts";
import { decodeSessionCookie, encodeSessionCookie, requestSessionId } from "../apps/control-tower/lib/demo-session";
import { acquireExecutionLease, createWorkflowAction, newActionId, newSessionId, newWorkflowId, readActions, releaseExecutionLease, updateAction } from "../apps/control-tower/lib/workflow-actions";
import { shouldRecoverWorkflowAction } from "../apps/control-tower/lib/workflow-recovery";

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

  it("allows only one durable execution owner and releases it for recovery", async () => {
    const sessionId = newSessionId();
    try {
      const created = await createWorkflowAction({ command: "analyze", sessionId, workflowId: newWorkflowId(), revision: 0 });
      const first = await acquireExecutionLease(created.action.actionId, sessionId, "inngest:test");
      const second = await acquireExecutionLease(created.action.actionId, sessionId, "browser:test");
      expect(first.acquired).toBe(true);
      expect(second.acquired).toBe(false);
      expect(second.action.executionLease?.owner).toBe("inngest:test");

      await updateAction(created.action.actionId, { message: "heartbeat from worker" }, sessionId);
      await releaseExecutionLease(created.action.actionId, sessionId, "inngest:test", first.lease!.token);
      const recovered = await acquireExecutionLease(created.action.actionId, sessionId, "browser:test");
      expect(recovered.acquired).toBe(true);
      expect(recovered.action.executionLease?.owner).toBe("browser:test");
    } finally {
      await clearArtifact("workflowActions", sessionId);
    }
  });

  it("persists execution mode and parent phase on the action envelope", async () => {
    const sessionId = newSessionId();
    try {
      const created = await createWorkflowAction({ command: "approve_release", sessionId, workflowId: newWorkflowId(), revision: 3, executionMode: "full_verification", parentPhase: "awaiting_release_approval" });
      expect(created.action.executionMode).toBe("full_verification");
      expect(created.action.parentPhase).toBe("awaiting_release_approval");
      expect(created.action.idempotencyKey).toContain("full_verification");
    } finally {
      await clearArtifact("workflowActions", sessionId);
    }
  });

  it("does not recover an action while its lease is still valid", async () => {
    const now = Date.now();
    const sessionId = newSessionId();
    try {
      const created = await createWorkflowAction({ command: "analyze", sessionId, workflowId: newWorkflowId(), revision: 0 });
      const leased = await acquireExecutionLease(created.action.actionId, sessionId, "inngest:test", 60_000);
      expect(shouldRecoverWorkflowAction({ ...leased.action, status: "running", heartbeatAt: new Date(now - 120_000).toISOString() }, now)).toBe(false);
    } finally {
      await clearArtifact("workflowActions", sessionId);
    }
  });
});
