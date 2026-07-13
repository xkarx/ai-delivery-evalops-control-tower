import { inngest } from "./client";
import { persistStructuredRecord, readArtifact, writeArtifact } from "@/lib/durable-artifacts";
import { getAction, recordActionStep, updateAction } from "@/lib/workflow-actions";
import type { WorkflowCommand, WorkflowProgressStep } from "@dailycart/schemas";

type WorkflowCompletedEvent = {
  workflowId?: string;
  sessionId?: string;
  featureId?: string;
  featureIds?: string[];
  phase?: string;
  proofId?: string;
};

export const recordWorkflowCompletion = inngest.createFunction(
  { id: "record-workflow-completion", retries: 3, triggers: { event: "dailycart/workflow.completed" } },
  async ({ event, step }) => {
    const data = event.data as WorkflowCompletedEvent;
    const eventId = event.id;
    const recordId = data.proofId ?? eventId;

    await step.run("persist-workflow-event", async () => {
      await persistStructuredRecord("inngest_runs", recordId, {
        eventId,
        functionId: "record-workflow-completion",
        status: "running",
        workflowId: data.workflowId,
        sessionId: data.sessionId,
        featureId: data.featureId,
        featureIds: data.featureIds,
        phase: data.phase,
        sourceMode: process.env.INTEGRATION_MODE === "live" ? "live" : "deterministic-fallback",
        startedAt: new Date().toISOString()
      });
      return { eventId, recordId };
    });

    return step.run("complete-workflow-event", async () => {
      const completedAt = new Date().toISOString();
      const output = {
        eventId,
        functionId: "record-workflow-completion",
        status: "completed",
        workflowId: data.workflowId,
        sessionId: data.sessionId,
        featureId: data.featureId,
        featureIds: data.featureIds,
        phase: data.phase,
        sourceMode: process.env.INTEGRATION_MODE === "live" ? "live" : "deterministic-fallback",
        completedAt
      };
      await persistStructuredRecord("inngest_runs", recordId, output);
      return output;
    });
  }
);

type WorkflowActionEvent = { actionId: string; sessionId: string; workflowId: string; command: WorkflowCommand; rationale?: string };

function appUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

async function callRoute(path: string, init: RequestInit = {}, identity?: { sessionId: string; workflowId: string; actionId: string }): Promise<Record<string, unknown>> {
  const response = await fetch(`${appUrl()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.DAILYCART_OPERATOR_PASSCODE ?? ""}`, ...(identity ? { "x-dailycart-session-id": identity.sessionId, "x-dailycart-workflow-id": identity.workflowId, "x-dailycart-action-id": identity.actionId } : {}), ...(init.headers as Record<string, string> | undefined) }
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.ok === false) throw new Error(String(payload.detail ?? payload.message ?? `${path} returned HTTP ${response.status}.`));
  return payload;
}

async function bindActionToWorkflow(data: WorkflowActionEvent): Promise<void> {
  const workflow = await readArtifact<Record<string, unknown>>("workflow");
  if (workflow) await writeArtifact("workflow", { ...workflow, sessionId: data.sessionId, workflowInstanceId: data.workflowId, activeActionId: data.actionId });
}

async function progress(actionId: string, input: { id: string; label: string; detail: string; progress: number; phase: string; agent?: string; skillId?: string; provider?: string }): Promise<void> {
  const now = new Date().toISOString();
  const step: WorkflowProgressStep = { id: input.id, label: input.label, detail: input.detail, status: "succeeded", agent: input.agent, skillId: input.skillId, provider: input.provider, startedAt: now, completedAt: now };
  await recordActionStep(actionId, step, { status: "running", progress: input.progress, phase: input.phase, message: input.detail, nextAction: "The workflow will continue automatically until the next human gate." });
}

async function waitForPreviewReadiness(actionId: string, identity: WorkflowActionEvent): Promise<void> {
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    const payload = await callRoute("/api/workflow/preview-status", {}, { sessionId: identity.sessionId, workflowId: identity.workflowId, actionId });
    const statuses = (payload.statuses ?? []) as Array<{ state?: string }>;
    if (statuses.length && statuses.every((item) => item.state === "READY")) {
      await progress(actionId, { id: "preview-ready", label: "Preview deployments ready", detail: "Vercel reports every feature preview READY.", progress: 74, phase: "preview_ready", provider: "vercel" });
      return;
    }
    if (statuses.some((item) => ["ERROR", "CANCELED"].includes(item.state ?? ""))) throw new Error("A Vercel preview deployment failed before evaluation.");
    await updateAction(actionId, { status: "running", phase: "waiting_vercel", progress: 68, message: `Waiting for Vercel previews (${attempt}/36)…`, nextAction: "Preview evaluation starts automatically when every deployment is READY." });
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("Vercel previews did not become READY within three minutes.");
}

export const executeWorkflowAction = inngest.createFunction(
  { id: "execute-guided-workflow-action", retries: 2, concurrency: { limit: 1, key: "event.data.sessionId" }, triggers: { event: "dailycart/workflow.action.requested" } },
  async ({ event, step }) => {
    const data = event.data as WorkflowActionEvent;
    const identity = { sessionId: data.sessionId, workflowId: data.workflowId, actionId: data.actionId };
    const original = await getAction(data.actionId);
    if (!original) throw new Error(`Action ${data.actionId} is missing.`);
    if (original.status !== "queued") return original;
    await updateAction(data.actionId, { status: "running", attempts: original.attempts + 1, phase: "starting", progress: 2, message: "Durable workflow execution started.", nextAction: "Watch the execution timeline." });
    try {
      if (data.command === "analyze") {
        await progress(data.actionId, { id: "context", label: "Company context retrieved", detail: "Loaded the versioned evidence pack and validated references.", progress: 12, phase: "context", agent: "context retrieval", skillId: "context-retrieval" });
        await step.run("analyze-opportunities", () => callRoute("/api/workflow/run", { method: "POST" }, identity));
        await bindActionToWorkflow(data);
        await progress(data.actionId, { id: "agents", label: "Specialist agents evaluated opportunities", detail: "PM ranking, UX review, engineering feasibility, and agent-output evals completed.", progress: 100, phase: "awaiting_feature_approval", agent: "PM + UX + feasibility", skillId: "feature-prioritization" });
        return updateAction(data.actionId, { status: "waiting_human", phase: "awaiting_feature_approval", progress: 100, message: "Opportunity analysis is ready for human feature approval.", nextAction: "Review the evidence and approve the selected feature tracks." });
      }
      if (data.command === "approve_feature" || data.command === "retry") {
        if (data.command === "approve_feature") {
          await step.run("approve-feature-and-plan", () => callRoute("/api/workflow/run", { method: "POST", headers: { "x-dailycart-feature-approved": "true" } }, identity));
          await bindActionToWorkflow(data);
          await progress(data.actionId, { id: "planning", label: "Delivery plan created", detail: "Approved scope was organized into workstreams, dependencies, owners, and readiness checks.", progress: 28, phase: "planning", agent: "TPM", skillId: "implementation-planning" });
          await step.run("sync-providers", () => callRoute("/api/workflow/sync", { method: "POST" }, identity));
          await progress(data.actionId, { id: "providers", label: "Delivery records synchronized", detail: "Linear, Slack, Langfuse, Supabase, and Inngest records are linked.", progress: 42, phase: "provider_sync", provider: "provider adapters" });
          await step.run("build-previews", () => callRoute("/api/workflow/preview", { method: "POST", body: JSON.stringify({ reconcile: true }) }, identity));
          await progress(data.actionId, { id: "build", label: "Parallel product builds started", detail: "Feature branches, commits, pull requests, and Vercel preview deployments were created or reused.", progress: 62, phase: "building_preview", agent: "Engineering", skillId: "code-implementation" });
        } else {
          const existingPreview = await readArtifact<{ builds?: unknown[] }>("workflowPreview");
          if (!existingPreview?.builds?.length) throw new Error("RETRY_STATE_MISSING: Existing preview builds were not found; start feature delivery again.");
          await bindActionToWorkflow(data);
          await progress(data.actionId, { id: "resume", label: "Resumed failed preview evaluation", detail: "Reusing approved planning, provider records, pull requests, and READY previews.", progress: 62, phase: "preview_ready", agent: "EvalOps", skillId: "release-readiness" });
        }
        await step.run("wait-for-previews", () => waitForPreviewReadiness(data.actionId, data));
        const evaluation = await step.run("evaluate-previews", () => callRoute("/api/workflow/preview-eval", { method: "POST", body: JSON.stringify({ rerun: true }) }, identity));
        const allPassed = Boolean(evaluation.allPassed);
        if (!allPassed) {
          const errorCode = String(evaluation.errorCode ?? "PREVIEW_EVAL_FAILED");
          if (errorCode === "PREVIEW_AUTH_FAILED" || errorCode === "PREVIEW_NOT_READY") throw new Error(`${errorCode}: ${String(evaluation.detail ?? "Preview infrastructure prevented evaluation.")}`);
          await progress(data.actionId, { id: "blocked", label: "Critical preview eval blocked release", detail: "Engineering is applying the measured focus-restoration correction.", progress: 80, phase: "correcting_preview", agent: "EvalOps + Engineering", skillId: "release-readiness" });
          await step.run("correct-preview", () => callRoute("/api/workflow/preview", { method: "POST", body: JSON.stringify({ correctBlocked: true }) }, identity));
          await step.run("wait-for-corrected-preview", () => waitForPreviewReadiness(data.actionId, data));
          const corrected = await step.run("evaluate-corrected-preview", () => callRoute("/api/workflow/preview-eval", { method: "POST", body: JSON.stringify({ rerun: true }) }, identity));
          if (!corrected.allPassed) throw new Error(`Corrected preview evaluation failed: ${String(corrected.detail ?? corrected.errorCode ?? "critical check failed")}`);
        }
        await progress(data.actionId, { id: "eval", label: "Preview evaluations passed", detail: "Both current preview commits passed critical release checks.", progress: 100, phase: "awaiting_release_approval", agent: "EvalOps", skillId: "release-readiness" });
        return updateAction(data.actionId, { status: "waiting_human", phase: "awaiting_release_approval", progress: 100, message: "All preview checks passed. Human release approval is required.", nextAction: "Inspect the previews and eval evidence, then approve the release." });
      }
      if (data.command === "approve_release") {
        await step.run("approve-release", () => callRoute("/api/workflow/approve", { method: "POST", body: JSON.stringify({ reviewer: "operator", rationale: data.rationale ?? "Approved after current previews and critical evaluations passed." }) }, identity));
        await progress(data.actionId, { id: "release-approved", label: "Human release approval recorded", detail: "The immutable release gate is approved; production promotion is starting.", progress: 35, phase: "deploying", agent: "operator" });
        await step.run("deploy-release", () => callRoute("/api/workflow/deploy", { method: "POST" }, identity));
        await progress(data.actionId, { id: "deployed", label: "Production release completed", detail: "GitHub, Vercel, Linear, and Slack release records were updated.", progress: 100, phase: "released", agent: "Release", skillId: "release-readiness", provider: "vercel" });
        return updateAction(data.actionId, { status: "succeeded", phase: "released", progress: 100, message: "The approved release is live and ready for product analytics.", nextAction: "Run bounded product traffic and observe outcomes." });
      }
      throw new Error(`Command ${data.command} is not implemented by the guided runner.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unexpected workflow action failure.";
      await updateAction(data.actionId, { status: "failed", phase: "failed", message: "Workflow action failed.", nextAction: "Inspect the exact failure and retry this step.", error: { code: detail.split(":")[0] || "WORKFLOW_ACTION_FAILED", detail, retryable: true } });
      throw error;
    }
  }
);
