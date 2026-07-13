import type { WorkflowAction, WorkflowProgressStep } from "@dailycart/schemas";
import { readArtifact, writeArtifact } from "./durable-artifacts";
import { getAction, recordActionStep, updateAction } from "./workflow-actions";

type Identity = Pick<WorkflowAction, "actionId" | "sessionId" | "workflowId" | "command"> & { rationale?: string };

async function callRoute(request: Request, path: string, init: RequestInit, identity: Identity): Promise<Record<string, unknown>> {
  const response = await fetch(new URL(path, request.url), {
    ...init,
    headers: {
      "content-type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
      authorization: `Bearer ${process.env.DAILYCART_OPERATOR_PASSCODE ?? ""}`,
      "x-dailycart-session-id": identity.sessionId,
      "x-dailycart-workflow-id": identity.workflowId,
      "x-dailycart-action-id": identity.actionId,
      ...(init.headers as Record<string, string> | undefined)
    }
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.ok === false) throw new Error(String(payload.detail ?? payload.message ?? `${path} returned HTTP ${response.status}.`));
  return payload;
}

async function bindAction(identity: Identity): Promise<void> {
  const workflow = await readArtifact<Record<string, unknown>>("workflow", identity.sessionId);
  if (workflow) await writeArtifact("workflow", { ...workflow, sessionId: identity.sessionId, workflowInstanceId: identity.workflowId, activeActionId: identity.actionId }, identity.sessionId);
}

async function completeStep(actionId: string, sessionId: string, input: { id: string; label: string; detail: string; progress: number; phase: string; agent?: string; skillId?: string; provider?: string }): Promise<void> {
  const now = new Date().toISOString();
  const step: WorkflowProgressStep = { id: input.id, label: input.label, detail: input.detail, status: "succeeded", agent: input.agent, skillId: input.skillId, provider: input.provider, startedAt: now, completedAt: now };
  await recordActionStep(actionId, step, { status: "running", progress: input.progress, phase: input.phase, message: input.detail, nextAction: "The workflow continues automatically until the next human decision." }, sessionId);
}

async function waitForPreviews(request: Request, identity: Identity): Promise<void> {
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    const payload = await callRoute(request, "/api/workflow/preview-status", {}, identity);
    const statuses = (payload.statuses ?? []) as Array<{ state?: string }>;
    if (statuses.length && statuses.every((item) => item.state === "READY")) {
      await completeStep(identity.actionId, identity.sessionId, { id: "preview-ready", label: "Preview deployments ready", detail: "Vercel reports every feature preview READY.", progress: 74, phase: "preview_ready", provider: "vercel" });
      return;
    }
    if (statuses.some((item) => ["ERROR", "CANCELED"].includes(item.state ?? ""))) throw new Error("PREVIEW_DEPLOYMENT_FAILED: A Vercel preview failed before evaluation.");
    await updateAction(identity.actionId, { status: "running", phase: "waiting_vercel", progress: 68, message: `Waiting for Vercel previews (${attempt}/36).`, nextAction: "Browser evaluation starts when every preview is READY." }, identity.sessionId);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("PREVIEW_READY_TIMEOUT: Vercel previews did not become READY within three minutes.");
}

export async function executeWorkflowActionDirect(request: Request, identity: Identity): Promise<WorkflowAction> {
  const original = await getAction(identity.actionId, identity.sessionId);
  if (!original) throw new Error(`ACTION_NOT_FOUND: ${identity.actionId} does not exist.`);
  await updateAction(identity.actionId, { status: "running", attempts: original.attempts + 1, phase: "starting", progress: 2, message: "Execution worker started.", nextAction: "Agent activity will appear here as each step completes." }, identity.sessionId);
  try {
    if (identity.command === "analyze") {
      await completeStep(identity.actionId, identity.sessionId, { id: "context", label: "Company context retrieved", detail: "Loaded the versioned evidence pack and validated its references.", progress: 12, phase: "context", agent: "Context Retrieval Agent", skillId: "context-retrieval" });
      const current = await getAction(identity.actionId, identity.sessionId);
      const queuedAgents: WorkflowProgressStep[] = [
        { id: "research", label: "Synthesize research", detail: "Interview evidence and customer language are being synthesized.", status: "running", agent: "research", skillId: "interview-synthesis", startedAt: new Date().toISOString() },
        { id: "support", label: "Cluster support signals", detail: "Support issues will be grouped and linked to evidence.", status: "pending", agent: "support", skillId: "support-ticket-clustering" },
        { id: "analytics", label: "Analyze product behavior", detail: "Behavioral signals and funnel observations will be assessed.", status: "pending", agent: "analytics", skillId: "analytics-anomaly-analysis" },
        { id: "pm", label: "Rank opportunities", detail: "Evidence-grounded opportunities will be scored and ranked.", status: "pending", agent: "PM Agent", skillId: "feature-prioritization" },
        { id: "ux", label: "Review experience risks", detail: "Clarity, accessibility, and interaction risks will be reviewed.", status: "pending", agent: "UX Agent", skillId: "ux-review" },
        { id: "feasibility", label: "Review engineering feasibility", detail: "Affected surfaces, dependencies, telemetry, and preview needs will be reviewed.", status: "pending", agent: "engineering_feasibility", skillId: "engineering-feasibility-review" },
        { id: "agent-evals", label: "Evaluate agent outputs", detail: "Citation, grounding, quality, and role-boundary checks will run.", status: "pending", agent: "eval", skillId: "agent-output-evaluation" }
      ];
      await updateAction(identity.actionId, { status: "running", phase: "agent_research", progress: 22, message: "Research Agent is synthesizing interview evidence.", nextAction: "Seven visible agent and evaluation stages run before the feature-approval gate.", steps: [...(current?.steps ?? []), ...queuedAgents] }, identity.sessionId);
      const runResult = await callRoute(request, "/api/workflow/run", { method: "POST" }, identity);
      const progressRunIds = (runResult.progressRunIds ?? {}) as Record<string, string>;
      await bindAction(identity);
      const completed = new Date().toISOString();
      const afterRun = await getAction(identity.actionId, identity.sessionId);
      await updateAction(identity.actionId, { status: "running", progress: 100, phase: "awaiting_feature_approval", message: "Specialist agents and their output evaluations completed.", steps: (afterRun?.steps ?? []).map((step) => ({ ...step, status: "succeeded" as const, relatedRunIds: progressRunIds[step.id] ? [progressRunIds[step.id]!] : step.relatedRunIds, startedAt: step.startedAt ?? completed, completedAt: step.completedAt ?? completed })) }, identity.sessionId);
      return updateAction(identity.actionId, { status: "waiting_human", phase: "awaiting_feature_approval", progress: 100, message: "Opportunity analysis is ready for human feature approval.", nextAction: "Review the ranked evidence and approve or reject the proposed feature tracks.", error: undefined }, identity.sessionId);
    }

    if (identity.command === "approve_feature" || identity.command === "retry") {
      if (identity.command === "approve_feature") {
        await callRoute(request, "/api/workflow/run", { method: "POST", headers: { "x-dailycart-feature-approved": "true" } }, identity);
        await bindAction(identity);
        await completeStep(identity.actionId, identity.sessionId, { id: "planning", label: "Delivery plan created", detail: "Approved scope was decomposed into workstreams, dependencies, owners, risks, and readiness checks.", progress: 28, phase: "planning", agent: "TPM", skillId: "implementation-planning" });
        await callRoute(request, "/api/workflow/sync", { method: "POST" }, identity);
        await completeStep(identity.actionId, identity.sessionId, { id: "providers", label: "Delivery records synchronized", detail: "Linear, Slack, Langfuse, Supabase, and Inngest references were recorded.", progress: 42, phase: "provider_sync", provider: "provider adapters" });
        await callRoute(request, "/api/workflow/preview", { method: "POST", body: JSON.stringify({ reconcile: true }) }, identity);
        await completeStep(identity.actionId, identity.sessionId, { id: "build", label: "Parallel product builds started", detail: "Feature branches, commits, pull requests, and preview deployments were created or reused.", progress: 62, phase: "building_preview", agent: "Engineering", skillId: "code-implementation" });
      } else {
        const existingPreview = await readArtifact<{ builds?: unknown[] }>("workflowPreview", identity.sessionId);
        if (!existingPreview?.builds?.length) throw new Error("RETRY_STATE_MISSING: Existing preview builds were not found; start feature delivery again.");
        await bindAction(identity);
        await completeStep(identity.actionId, identity.sessionId, { id: "resume", label: "Resumed failed preview evaluation", detail: "Reusing the approved plan, provider records, pull requests, and READY Vercel previews without duplicating earlier work.", progress: 62, phase: "preview_ready", agent: "EvalOps", skillId: "release-readiness" });
      }
      await waitForPreviews(request, identity);
      const evaluation = await callRoute(request, "/api/workflow/preview-eval", { method: "POST", body: JSON.stringify({ rerun: true }) }, identity);
      if (!evaluation.allPassed) {
        const code = String(evaluation.errorCode ?? "PREVIEW_EVAL_FAILED");
        if (["PREVIEW_AUTH_FAILED", "PREVIEW_NOT_READY"].includes(code)) throw new Error(`${code}: ${String(evaluation.detail ?? "Preview infrastructure prevented evaluation.")}`);
        await completeStep(identity.actionId, identity.sessionId, { id: "blocked", label: "Critical preview eval blocked release", detail: "Engineering is applying the measured focus-restoration correction.", progress: 80, phase: "correcting_preview", agent: "EvalOps + Engineering", skillId: "release-readiness" });
        await callRoute(request, "/api/workflow/preview", { method: "POST", body: JSON.stringify({ correctBlocked: true }) }, identity);
        await waitForPreviews(request, identity);
        const corrected = await callRoute(request, "/api/workflow/preview-eval", { method: "POST", body: JSON.stringify({ rerun: true }) }, identity);
        if (!corrected.allPassed) throw new Error(`PREVIEW_CORRECTION_FAILED: ${String(corrected.detail ?? corrected.errorCode ?? "A critical browser check failed.")}`);
      }
      await completeStep(identity.actionId, identity.sessionId, { id: "eval", label: "Preview evaluations passed", detail: "Both current preview commits passed the critical release checks.", progress: 100, phase: "awaiting_release_approval", agent: "EvalOps", skillId: "release-readiness" });
      return updateAction(identity.actionId, { status: "waiting_human", phase: "awaiting_release_approval", progress: 100, message: "All preview checks passed. Human release approval is required.", nextAction: "Inspect both previews and their eval evidence, then approve the release.", error: undefined }, identity.sessionId);
    }

    if (identity.command === "approve_release") {
      await callRoute(request, "/api/workflow/approve", { method: "POST", body: JSON.stringify({ reviewer: "operator", rationale: identity.rationale ?? "Approved after current previews and critical evaluations passed." }) }, identity);
      await completeStep(identity.actionId, identity.sessionId, { id: "release-approved", label: "Human release approval recorded", detail: "The immutable release gate is approved; production promotion is starting.", progress: 35, phase: "deploying", agent: "operator" });
      await callRoute(request, "/api/workflow/deploy", { method: "POST" }, identity);
      await completeStep(identity.actionId, identity.sessionId, { id: "deployed", label: "Production release completed", detail: "GitHub, Vercel, Linear, and Slack release records were updated.", progress: 100, phase: "released", agent: "Release", skillId: "release-readiness", provider: "vercel" });
      return updateAction(identity.actionId, { status: "succeeded", phase: "released", progress: 100, message: "The approved release is live and ready for product analytics.", nextAction: "Run bounded product traffic and observe outcomes.", error: undefined }, identity.sessionId);
    }
    if (identity.command === "declare_incident") {
      const result = await callRoute(request, "/api/incidents", { method: "POST", body: JSON.stringify({
        title: "Checkout recovery regression detected after release",
        rootCause: "Observed checkout recovery behavior no longer matches the approved release baseline.",
        severity: "SEV-3",
        featureId: "FEAT-0001"
      }) }, identity);
      const externalRefs = ((result.externalRefs ?? []) as Array<{ provider: string; id: string; url?: string }>);
      await completeStep(identity.actionId, identity.sessionId, { id: "incident", label: "Incident converted into regression protection", detail: `${String((result.incident as { id?: string } | undefined)?.id ?? "Incident")} created a durable regression eval case and provider follow-up.`, progress: 100, phase: "incident_learning", agent: "Incident Agent", skillId: "incident-to-regression" });
      return updateAction(identity.actionId, { status: "succeeded", phase: "incident_learning", progress: 100, message: "The production signal is linked to an incident, follow-up ticket, and regression case.", nextAction: "Inspect end-to-end lineage or start a new isolated demo.", externalRefs, error: undefined }, identity.sessionId);
    }
    throw new Error(`COMMAND_NOT_IMPLEMENTED: ${identity.command} is not available in the guided runner.`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unexpected workflow action failure.";
    await updateAction(identity.actionId, { status: "failed", phase: "failed", message: "Workflow action failed.", nextAction: "Inspect the exact failure and retry this step.", error: { code: detail.split(":")[0] || "WORKFLOW_ACTION_FAILED", detail, retryable: true } }, identity.sessionId);
    throw error;
  }
}
