import { NextResponse } from "next/server";
import { DeliveryWorkflow, type WorkflowSnapshot } from "@dailycart/workflow";
import { agentRunSchema, assertDemoState, evalCampaignSchema, type DemoState } from "@dailycart/schemas";
import { requireOperatorAccess } from "@/lib/operator-auth";
import { persistStructuredRecord, readArtifact, writeArtifact } from "@/lib/durable-artifacts";
import { updateAction } from "@/lib/workflow-actions";
import { requestSessionId } from "@/lib/demo-session";
import { loadDemoState } from "@/lib/load-demo-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type PreviewBuild = { featureId: string; deploymentUrl: string; sourceMode: string; commitSha: string; revision?: number; suite?: string };
type PreviewEval = { featureId: string; targetUrl: string; passed: boolean; score: number; checks: Array<{ name: string; passed: boolean; detail: string }>; sourceMode: string; evaluatedAt: string; githubRunUrl?: string; commitSha?: string; revision?: number; suite?: string };

type GitHubRun = { id: number; name?: string; display_title?: string; status?: string; conclusion?: string | null; html_url: string; created_at: string };

type StoredWorkflow = {
  sessionId?: string;
  workflowInstanceId?: string;
  phase: string;
  sourceMode: "simulated" | "live";
  featureId: string;
  ticketIds: string[];
  blockedCampaignId: string;
  passedCampaignId: string;
  releaseApprovalId: string;
  evidenceIds?: string[];
  featureBatchId?: string;
  workflow: WorkflowSnapshot;
  featureTracks?: Array<{
    featureId: string;
    featureTitle: string;
    ticketIds: string[];
    blockedCampaignId: string;
    passedCampaignId: string;
    releaseApprovalId: string;
    status: string;
  }>;
  [key: string]: unknown;
};

class GitHubRequestError extends Error {
  constructor(readonly status: number, detail: string) { super(detail); }
}

async function githubRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const repository = process.env.GITHUB_DEFAULT_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token) throw new Error("GitHub credentials are required for preview-target browser evaluation.");
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...init,
    cache: "no-store",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28", ...(init.headers as Record<string, string> | undefined) }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string };
    throw new GitHubRequestError(response.status, `GitHub preview evaluation returned HTTP ${response.status}: ${payload.message ?? "request rejected"}.`);
  }
  return (response.status === 204 ? {} : await response.json()) as T;
}

async function heartbeat(actionId: string | undefined, sessionId: string, patch: { phase: string; progress: number; message: string; nextAction: string }): Promise<void> {
  if (!actionId) return;
  await updateAction(actionId, { status: "running", ...patch }, sessionId).catch(() => undefined);
}

async function runPreviewBrowserEval(build: PreviewBuild, sessionId: string, actionId?: string): Promise<{ passed: boolean; detail: string; url?: string }> {
  const workflow = process.env.GITHUB_PREVIEW_EVAL_WORKFLOW || "preview-eval.yml";
  const ref = process.env.GITHUB_DEFAULT_BRANCH || "main";
  const startedAt = Date.now();
  let event = "workflow_dispatch";
  await heartbeat(actionId, sessionId, { phase: "preview_evaluating", progress: 76, message: `Starting GitHub browser evaluation for ${build.featureId}.`, nextAction: "The workflow will display the exact browser result when the GitHub run completes." });
  try {
    await githubRequest(`/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref, inputs: { preview_url: build.deploymentUrl, feature_id: build.featureId, commit_sha: build.commitSha } })
    });
  } catch (error) {
    if (!(error instanceof GitHubRequestError) || error.status !== 403) throw error;
    event = "repository_dispatch";
    await githubRequest("/dispatches", {
      method: "POST",
      body: JSON.stringify({ event_type: "dailycart-preview-eval", client_payload: { preview_url: build.deploymentUrl, feature_id: build.featureId, commit_sha: build.commitSha } })
    });
  }
  let run: GitHubRun | undefined;
  const shortSha = build.commitSha.slice(0, 7);
  for (let attempt = 0; attempt < 24 && !run; attempt += 1) {
    await heartbeat(actionId, sessionId, { phase: "preview_evaluating", progress: 77, message: `Waiting for GitHub to register the ${build.featureId} browser run.`, nextAction: "No operator action is required." });
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    const payload = await githubRequest<{ workflow_runs?: GitHubRun[] }>(`/actions/workflows/${encodeURIComponent(workflow)}/runs?event=${event}&branch=${encodeURIComponent(ref)}&per_page=30`);
    run = payload.workflow_runs?.find((candidate) => Date.parse(candidate.created_at) >= startedAt - 10_000 && `${candidate.name ?? ""} ${candidate.display_title ?? ""}`.includes(build.featureId) && `${candidate.name ?? ""} ${candidate.display_title ?? ""}`.includes(shortSha));
  }
  if (!run) throw new Error(`GitHub did not expose the ${build.featureId} preview-eval run after dispatch.`);
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const current = await githubRequest<GitHubRun>(`/actions/runs/${run.id}`);
    if (current.status === "completed") {
      await heartbeat(actionId, sessionId, { phase: "preview_evaluating", progress: 79, message: `${build.featureId} browser evaluation ${current.conclusion ?? "completed"}.`, nextAction: current.conclusion === "success" ? "The next preview track will be evaluated automatically." : "The measured failure will trigger an engineering correction." });
      return { passed: current.conclusion === "success", detail: `GitHub preview browser evaluation ${current.conclusion ?? "completed"} for ${build.commitSha}.`, url: current.html_url };
    }
    await heartbeat(actionId, sessionId, { phase: "preview_evaluating", progress: 78, message: `GitHub browser evaluation is ${current.status ?? "running"} for ${build.featureId} (${attempt + 1}/48).`, nextAction: "No operator action is required." });
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`GitHub preview evaluation timed out for ${build.featureId}.`);
}

function previewRequestHeaders(): HeadersInit {
  const automationBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (automationBypass) return { "x-vercel-protection-bypass": automationBypass };
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  return oidcToken ? { "x-vercel-trusted-oidc-idp-token": oidcToken } : {};
}

function runIdForCampaign(campaignId: string): string {
  return `RUN-${campaignId.replace(/\D/g, "")}`;
}

function resultIdForCampaign(campaignId: string, index: number): string {
  return `EVALCASE-${Number(campaignId.replace(/\D/g, "")) * 10 + index + 1}`;
}

function appendById<T extends { id: string }>(current: T[], additions: T[]): T[] {
  const records = new Map(current.map((item) => [item.id, item]));
  for (const item of additions) records.set(item.id, item);
  return [...records.values()];
}

async function persistMeasuredGate(sessionId: string, evaluations: PreviewEval[], allPassed: boolean): Promise<void> {
  const stored = await readArtifact<StoredWorkflow>("workflow", sessionId);
  if (!stored) throw new Error("The preview evaluations are not attached to an active delivery workflow.");
  if (stored.sessionId && stored.sessionId !== sessionId) throw new Error("The preview evaluations belong to a different demo session.");
  if (!stored.evidenceIds?.length) throw new Error("DATA_INTEGRITY_FAILED: Preview evaluation is missing the workflow evidence provenance.");

  const now = new Date().toISOString();
  const campaignId = allPassed ? stored.passedCampaignId : stored.blockedCampaignId;
  if (!campaignId) throw new Error("The workflow is missing its measured evaluation campaign identifier.");
  const runId = runIdForCampaign(campaignId);
  const score = Math.round(evaluations.reduce((total, evaluation) => total + evaluation.score, 0) / Math.max(evaluations.length, 1));
  const sourceMode = evaluations.every((evaluation) => evaluation.sourceMode === "live") ? "live" as const : "simulated" as const;
  const campaign = evalCampaignSchema.parse({
    id: campaignId,
    featureId: stored.featureId,
    version: allPassed ? 2 : 1,
    status: allPassed ? "passed" : "blocked",
    threshold: 85,
    weightedScore: score,
    results: evaluations.map((evaluation, index) => ({
      caseId: resultIdForCampaign(campaignId, index),
      grader: "github-preview-browser",
      score: evaluation.score,
      passed: evaluation.passed,
      rationale: `${evaluation.featureId} at ${evaluation.targetUrl}: ${evaluation.checks.map((check) => `${check.passed ? "pass" : "fail"} ${check.name} (${check.detail})`).join("; ")}`,
      measuredAt: evaluation.evaluatedAt,
      durationMs: 0
    })),
    failureCategories: allPassed ? [] : ["preview-browser-regression"],
    requiredApprovalPresent: false,
    releaseAllowed: allPassed,
    runId,
    sourceMode
  });
  const evalRun = agentRunSchema.parse({
    id: runId,
    agent: "eval",
    status: allPassed ? "succeeded" : "blocked",
    startedAt: evaluations[0]?.evaluatedAt ?? now,
    finishedAt: now,
    featureId: stored.featureId,
    ticketIds: stored.ticketIds,
    traceId: `trace-preview-eval-${campaignId.toLowerCase()}`,
    skillId: "release-readiness",
    skillVersion: "1.0.0",
    contextPackId: "1.0.0",
    featureBatchId: stored.featureBatchId,
    citedEvidenceIds: stored.evidenceIds ?? [],
    reasoningSummary: allPassed
      ? "The exact current preview URLs and commit SHAs passed the remote browser and release-policy checks. Human release approval is now required."
      : "At least one exact current preview URL or commit failed a release-blocking remote browser check. Release remains blocked until a corrected preview passes.",
    toolCalls: evaluations.map((evaluation) => ({
      name: "preview-target-browser-evaluation",
      provider: "github",
      status: evaluation.passed ? "succeeded" as const : "failed" as const,
      detail: `${evaluation.featureId} scored ${evaluation.score}/100 against ${evaluation.targetUrl}.`,
      url: evaluation.githubRunUrl
    })),
    costUsd: 0,
    latencyMs: 0,
    retries: 0,
    steps: evaluations.map((evaluation) => ({
      name: `Evaluate ${evaluation.featureId} preview`,
      status: evaluation.passed ? "succeeded" as const : "blocked" as const,
      durationMs: 0,
      detail: `${evaluation.score}/100 for commit-targeted browser evaluation at ${evaluation.targetUrl}.`
    })),
    sourceMode
  });

  const workflow = DeliveryWorkflow.hydrate(stored.workflow);
  let snapshot = workflow.snapshot();
  if (allPassed) {
    if (snapshot.phase === "blocked") snapshot = workflow.rerunAfterCorrection("engineering-agent", "Corrected preview commit is ready for measured browser reevaluation");
    if (snapshot.phase === "evaluation") snapshot = workflow.recordEvalGate({
      campaignId,
      releaseAllowed: true,
      reason: "Both current preview commits passed the measured GitHub browser evaluation",
      actor: "eval-agent",
      releaseApprovalId: stored.releaseApprovalId
    });
  } else if (snapshot.phase === "evaluation") {
    snapshot = workflow.recordEvalGate({
      campaignId,
      releaseAllowed: false,
      reason: "A current preview commit failed a measured GitHub browser evaluation",
      actor: "eval-agent"
    });
  }

  const state = await loadDemoState(sessionId);
  const releaseApproval = snapshot.pendingApproval?.approval;
  const next: DemoState = {
    ...state,
    campaigns: appendById(state.campaigns, [campaign]),
    runs: appendById(state.runs, [evalRun]),
    approvals: releaseApproval ? appendById(state.approvals, [releaseApproval]) : state.approvals,
    features: state.features.map((feature) => {
      const evaluation = evaluations.find((item) => item.featureId === feature.id);
      return evaluation ? { ...feature, status: evaluation.passed ? "in_delivery" as const : "blocked" as const } : feature;
    }),
    activity: [
      {
        at: now,
        type: "eval",
        title: allPassed ? "Measured preview campaign passed" : "Measured preview campaign blocked release",
        detail: `${campaign.id} scored ${campaign.weightedScore}/100 across ${evaluations.length} current preview target(s).`,
        entityId: campaign.id
      },
      ...state.activity.filter((item) => item.entityId !== campaign.id)
    ]
  };
  const tracks = stored.featureTracks?.map((track) => {
    const evaluation = evaluations.find((item) => item.featureId === track.featureId);
    return { ...track, status: evaluation?.passed ? "ready_for_release" : "blocked" };
  });
  await writeArtifact("demoState", assertDemoState(next), sessionId);
  await writeArtifact("workflow", { ...stored, phase: snapshot.phase, workflow: snapshot, featureTracks: tracks }, sessionId);
  await persistStructuredRecord("eval_campaigns", campaign.id, { ...campaign, sessionId, workflowId: stored.workflowInstanceId, previewTargets: evaluations }, sessionId);
  await persistStructuredRecord("workflow_runs", evalRun.id, { ...evalRun, sessionId, workflowId: stored.workflowInstanceId }, sessionId);
  if (releaseApproval) await persistStructuredRecord("approvals", releaseApproval.id, { ...releaseApproval, sessionId, workflowId: stored.workflowInstanceId }, sessionId);
}

export async function POST(request: Request) {
  const denied = await requireOperatorAccess();
  if (denied) return denied;
  const sessionId = requestSessionId(request);
  if (!sessionId) return NextResponse.json({ ok: false, message: "An active demo session is required." }, { status: 409 });
  try {
    const raw = await readArtifact<{ sessionId?: string; workflowId?: string; builds?: PreviewBuild[]; featureId?: string; deploymentUrl?: string; sourceMode?: string }>("workflowPreview", sessionId);
    if (!raw) throw new Error("Build product previews before running preview evaluations.");
    const builds: PreviewBuild[] = raw.builds ?? (raw.featureId && raw.deploymentUrl ? [{ featureId: raw.featureId, deploymentUrl: raw.deploymentUrl, sourceMode: raw.sourceMode ?? "mocked", commitSha: "legacy-missing" }] : []);
    if (!builds.length) throw new Error("Build product previews before running preview evaluations.");
    await request.json().catch(() => ({}));
    const actionId = request.headers.get("x-dailycart-action-id") ?? undefined;
    const existing = await readArtifact<{ evaluations?: PreviewEval[]; correctionPending?: boolean }>("workflowPreviewEval", sessionId);
    const workflow = await readArtifact<{ workflow?: { revision?: number } }>("workflow", sessionId);
    const revision = workflow?.workflow?.revision ?? 0;
    const suite = process.env.WORKFLOW_PREVIEW_EVAL_SUITE ?? "github-preview-browser-v1";
    const evaluations: PreviewEval[] = [];
    let errorCode: string | undefined;
    let errorDetail: string | undefined;
    for (const build of builds) {
      const previous = existing?.evaluations?.find((item) => item.targetUrl === build.deploymentUrl && item.featureId === build.featureId && item.commitSha === build.commitSha && item.revision === revision && item.suite === suite && item.passed);
      if (previous) { evaluations.push(previous); continue; }
      const checks: PreviewEval["checks"] = [];
      let githubRunUrl: string | undefined;
      if (build.sourceMode !== "mocked") {
        const response = await fetch(`${build.deploymentUrl.replace(/\/$/, "")}/product`, {
          signal: AbortSignal.timeout(10_000),
          headers: previewRequestHeaders()
        });
        const html = await response.text();
        const protectedLogin = /<title>Login\s*[–-]\s*Vercel<\/title>|Vercel Authentication/i.test(html);
        if (protectedLogin) { errorCode = "PREVIEW_AUTH_FAILED"; errorDetail = "Vercel returned its protected login page. Configure the automation bypass secret for the production evaluator."; }
        checks.push({ name: "preview reachable", passed: response.ok && !protectedLogin, detail: protectedLogin ? "Vercel protection intercepted the preview request." : `HTTP ${response.status}` });
        checks.push({ name: "feature shell rendered", passed: response.ok && !protectedLogin && /DailyCart|checkout/i.test(html), detail: protectedLogin ? "The response was Vercel login HTML, not the DailyCart product." : "Preview HTML contains the product shell." });
        checks.push({ name: "feature commit targeted", passed: Boolean(build.commitSha), detail: build.commitSha ? `Evaluated commit ${build.commitSha}.` : "The preview did not expose its tested commit." });
        if (!protectedLogin) {
          const browser = await runPreviewBrowserEval(build, sessionId, actionId);
          githubRunUrl = browser.url;
          checks.push({ name: "preview-target browser acceptance", passed: browser.passed, detail: browser.url ? `${browser.detail} ${browser.url}` : browser.detail });
        } else {
          checks.push({ name: "preview-target browser acceptance", passed: false, detail: "Browser evaluation was not dispatched because preview authentication failed." });
        }
      } else {
        checks.push({ name: "preview reachable", passed: true, detail: "Deterministic deployment adapter recorded a reachable preview." });
        checks.push({ name: "feature shell rendered", passed: true, detail: "Mock preview includes the feature-flagged product shell." });
        checks.push({ name: "keyboard recovery", passed: true, detail: "Focus is restored to the recovery action after interruption." });
      }
      evaluations.push({ featureId: build.featureId, targetUrl: build.deploymentUrl, passed: checks.every((check) => check.passed), score: Math.round((checks.filter((check) => check.passed).length / checks.length) * 100), checks, sourceMode: build.sourceMode, evaluatedAt: new Date().toISOString(), githubRunUrl, commitSha: build.commitSha, revision, suite });
    }
    const allPassed = evaluations.every((evaluation) => evaluation.passed);
    await writeArtifact("workflowPreviewEval", { sessionId, workflowId: raw?.workflowId, evaluations, allPassed, correctionPending: !allPassed && !errorCode, errorCode, errorDetail }, sessionId);
    if (!errorCode) await persistMeasuredGate(sessionId, evaluations, allPassed);
    return NextResponse.json({ ok: true, evaluations, allPassed, blocked: !allPassed, errorCode, detail: errorDetail }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Preview evaluation failed.", detail: error instanceof Error ? error.message : "Preview evaluation failed." }, { status: 502 });
  }
}
