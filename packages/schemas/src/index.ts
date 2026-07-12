import { z } from "zod";

export const sourceModeSchema = z.enum(["synthetic", "simulated", "mocked", "live"]);
export type SourceMode = z.infer<typeof sourceModeSchema>;

export const entityIdSchema = z.string().regex(
  /^(ORG|PROD|CUS|PER|EVD|FEAT|DEC|PRD|PROJ|TKT|RUN|APR|PR|EVAL|EVALCASE|DEP|REL|INC|ACT|EXT)-\d{4,}$/,
  "Expected a stable prefixed identifier"
);

const timestampSchema = z.string().datetime({ offset: true });

export const evidenceSchema = z.object({
  id: z.string().regex(/^EVD-\d{4,}$/),
  kind: z.enum(["interview", "support", "analytics", "survey", "incident", "discussion"]),
  title: z.string().min(3),
  summary: z.string().min(8),
  occurredAt: timestampSchema,
  customerId: z.string().regex(/^CUS-\d{4,}$/).optional(),
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]),
  tags: z.array(z.string()),
  sourceMode: sourceModeSchema.default("synthetic")
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const featureSchema = z.object({
  id: z.string().regex(/^FEAT-\d{4,}$/),
  title: z.string().min(3),
  problem: z.string().min(10),
  hypothesis: z.string().min(10),
  evidenceIds: z.array(z.string().regex(/^EVD-\d{4,}$/)).min(1),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  status: z.enum(["candidate", "awaiting_approval", "approved", "in_delivery", "blocked", "released"]),
  workstream: z.enum(["experience", "reliability", "platform"]),
  metrics: z.array(z.string()).min(1),
  sourceMode: sourceModeSchema
});
export type Feature = z.infer<typeof featureSchema>;

export const decisionSchema = z.object({
  id: z.string().regex(/^DEC-\d{4,}$/),
  featureId: z.string().regex(/^FEAT-\d{4,}$/),
  outcome: z.enum(["approved", "rejected", "changes_requested"]),
  rationale: z.string().min(5),
  reviewer: z.string().min(2),
  decidedAt: timestampSchema,
  sourceMode: sourceModeSchema
});
export type Decision = z.infer<typeof decisionSchema>;

export const ticketSchema = z.object({
  id: z.string().regex(/^TKT-\d{4,}$/),
  featureId: z.string().regex(/^FEAT-\d{4,}$/),
  title: z.string().min(3),
  description: z.string().min(8),
  status: z.enum(["todo", "in_progress", "in_review", "done", "blocked"]),
  workstream: z.string().min(2),
  dependsOn: z.array(z.string().regex(/^TKT-\d{4,}$/)),
  acceptanceCriteria: z.array(z.string()).min(1),
  externalUrl: z.string().url().optional(),
  sourceMode: sourceModeSchema
});
export type Ticket = z.infer<typeof ticketSchema>;

export const agentRunSchema = z.object({
  id: z.string().regex(/^RUN-\d{4,}$/),
  agent: z.enum(["pm", "ux", "engineering_feasibility", "tpm", "engineering", "eval", "release", "incident"]),
  status: z.enum(["queued", "running", "waiting_approval", "failed", "blocked", "succeeded"]),
  startedAt: timestampSchema,
  finishedAt: timestampSchema.optional(),
  featureId: z.string().regex(/^FEAT-\d{4,}$/).optional(),
  ticketIds: z.array(z.string().regex(/^TKT-\d{4,}$/)).default([]),
  traceId: z.string(),
  traceUrl: z.string().url().optional(),
  skillId: z.string().optional(),
  skillVersion: z.string().optional(),
  contextPackId: z.string().optional(),
  featureBatchId: z.string().optional(),
  toolCalls: z.array(z.object({ name: z.string(), provider: z.string(), status: z.enum(["succeeded", "failed"]), detail: z.string(), externalId: z.string().optional(), url: z.string().url().optional() })).optional(),
  reasoningSummary: z.string().optional(),
  citedEvidenceIds: z.array(z.string().regex(/^EVD-\d{4,}$/)).optional(),
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  steps: z.array(z.object({
    name: z.string(),
    status: z.enum(["succeeded", "failed", "blocked"]),
    durationMs: z.number().int().nonnegative(),
    detail: z.string()
  })),
  sourceMode: sourceModeSchema
});
export type AgentRun = z.infer<typeof agentRunSchema>;

export const approvalSchema = z.object({
  id: z.string().regex(/^APR-\d{4,}$/),
  featureId: z.string().regex(/^FEAT-\d{4,}$/),
  stage: z.enum(["feature", "preview", "release"]),
  status: z.enum(["pending", "approved", "rejected"]),
  requestedAt: timestampSchema,
  resolvedAt: timestampSchema.optional(),
  reviewer: z.string().optional(),
  rationale: z.string().optional(),
  sourceMode: sourceModeSchema
});
export type Approval = z.infer<typeof approvalSchema>;

export const evalCaseSchema = z.object({
  id: z.string().regex(/^EVALCASE-\d{4,}$/),
  datasetVersion: z.string(),
  category: z.enum(["grounding", "requirements", "build", "regression", "safety", "trajectory"]),
  input: z.record(z.unknown()),
  expected: z.record(z.unknown()),
  critical: z.boolean(),
  sourceMode: sourceModeSchema
});
export type EvalCase = z.infer<typeof evalCaseSchema>;

export const evalResultSchema = z.object({
  caseId: z.string().regex(/^EVALCASE-\d{4,}$/),
  grader: z.string(),
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  rationale: z.string(),
  measuredAt: timestampSchema,
  durationMs: z.number().int().nonnegative()
});
export type EvalResult = z.infer<typeof evalResultSchema>;

export const evalCampaignSchema = z.object({
  id: z.string().regex(/^EVAL-\d{4,}$/),
  featureId: z.string().regex(/^FEAT-\d{4,}$/),
  version: z.number().int().positive(),
  status: z.enum(["running", "blocked", "passed", "needs_review"]),
  threshold: z.number().min(0).max(100),
  weightedScore: z.number().min(0).max(100),
  results: z.array(evalResultSchema),
  failureCategories: z.array(z.string()),
  requiredApprovalPresent: z.boolean(),
  releaseAllowed: z.boolean(),
  runId: z.string().regex(/^RUN-\d{4,}$/),
  sourceMode: sourceModeSchema
});
export type EvalCampaign = z.infer<typeof evalCampaignSchema>;

export const deploymentSchema = z.object({
  id: z.string().regex(/^DEP-\d{4,}$/),
  featureId: z.string().regex(/^FEAT-\d{4,}$/),
  environment: z.enum(["preview", "production"]),
  status: z.enum(["pending", "ready", "failed", "rolled_back"]),
  commitSha: z.string(),
  url: z.string().url(),
  deployedAt: timestampSchema,
  sourceMode: sourceModeSchema
});
export type Deployment = z.infer<typeof deploymentSchema>;

export const incidentSchema = z.object({
  id: z.string().regex(/^INC-\d{4,}$/),
  featureId: z.string().regex(/^FEAT-\d{4,}$/).optional(),
  title: z.string(),
  severity: z.enum(["SEV-1", "SEV-2", "SEV-3"]),
  status: z.enum(["open", "mitigated", "resolved"]),
  detectedAt: timestampSchema,
  rootCause: z.string(),
  regressionCaseId: z.string().regex(/^EVALCASE-\d{4,}$/).optional(),
  sourceMode: sourceModeSchema
});
export type Incident = z.infer<typeof incidentSchema>;

export const lineageEdgeSchema = z.object({
  id: z.string(),
  sourceType: z.string(),
  sourceId: z.string(),
  relationship: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  createdAt: timestampSchema,
  metadata: z.record(z.unknown()).default({})
});
export type LineageEdge = z.infer<typeof lineageEdgeSchema>;

export const integrationHealthSchema = z.object({
  provider: z.enum(["github", "slack", "linear", "supabase", "langfuse", "posthog", "deployment", "workflow", "sample-product"]),
  mode: z.enum(["mock", "live"]),
  status: z.enum(["healthy", "degraded", "unconfigured", "error"]),
  message: z.string(),
  checkedAt: timestampSchema,
  externalUrl: z.string().url().optional(),
  capabilities: z.array(z.string())
});
export type IntegrationHealth = z.infer<typeof integrationHealthSchema>;

export const productEventSchema = z.object({
  id: z.string(),
  event: z.enum(["session_started", "product_viewed", "search_used", "cart_added", "checkout_started", "checkout_interrupted", "checkout_recovery_used", "checkout_completed", "cart_persisted", "cart_recovered", "feature_exposed", "error_seen"]),
  customerId: z.string().regex(/^CUS-\d{4,}$/),
  timestamp: timestampSchema,
  properties: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  sourceMode: sourceModeSchema
});
export type ProductEvent = z.infer<typeof productEventSchema>;

export const demoStateSchema = z.object({
  generatedAt: timestampSchema,
  seed: z.number().int(),
  scenario: z.string(),
  sourceMode: sourceModeSchema,
  features: z.array(featureSchema),
  decisions: z.array(decisionSchema),
  tickets: z.array(ticketSchema),
  approvals: z.array(approvalSchema),
  runs: z.array(agentRunSchema),
  campaigns: z.array(evalCampaignSchema),
  deployments: z.array(deploymentSchema),
  incidents: z.array(incidentSchema),
  lineage: z.array(lineageEdgeSchema),
  integrations: z.array(integrationHealthSchema),
  funnel: z.array(z.object({ stage: z.string(), count: z.number().int().nonnegative() })),
  activity: z.array(z.object({ at: timestampSchema, type: z.string(), title: z.string(), detail: z.string(), entityId: z.string() }))
});
export type DemoState = z.infer<typeof demoStateSchema>;

export function assertDemoState(value: unknown): DemoState {
  return demoStateSchema.parse(value);
}

export const workflowCommandSchema = z.enum(["analyze", "approve_feature", "approve_release", "retry", "declare_incident"]);
export type WorkflowCommand = z.infer<typeof workflowCommandSchema>;

export const workflowProgressStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["pending", "running", "succeeded", "failed", "waiting"]),
  detail: z.string(),
  agent: z.string().optional(),
  skillId: z.string().optional(),
  provider: z.string().optional(),
  startedAt: timestampSchema.optional(),
  completedAt: timestampSchema.optional()
});
export type WorkflowProgressStep = z.infer<typeof workflowProgressStepSchema>;

export const workflowActionSchema = z.object({
  actionId: z.string().regex(/^ACTION-[A-Z0-9]+$/),
  sessionId: z.string().regex(/^SESSION-[A-Z0-9]+$/),
  workflowId: z.string().regex(/^WORKFLOW-[A-Z0-9]+$/),
  command: workflowCommandSchema,
  idempotencyKey: z.string(),
  status: z.enum(["queued", "running", "waiting_human", "succeeded", "failed"]),
  phase: z.string(),
  progress: z.number().min(0).max(100),
  message: z.string(),
  nextAction: z.string(),
  attempts: z.number().int().nonnegative(),
  steps: z.array(workflowProgressStepSchema),
  externalRefs: z.array(z.object({ provider: z.string(), id: z.string(), url: z.string().url().optional() })),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  heartbeatAt: timestampSchema,
  error: z.object({ code: z.string(), detail: z.string(), retryable: z.boolean() }).optional()
});
export type WorkflowAction = z.infer<typeof workflowActionSchema>;

export const previewDeploymentStatusSchema = z.object({
  featureId: z.string().regex(/^FEAT-\d{4,}$/),
  deploymentId: z.string(),
  externalDeploymentId: z.string().optional(),
  state: z.enum(["QUEUED", "BUILDING", "READY", "ERROR", "CANCELED", "TIMEOUT"]),
  url: z.string().url(),
  commitSha: z.string(),
  checkedAt: timestampSchema
});
export type PreviewDeploymentStatus = z.infer<typeof previewDeploymentStatusSchema>;

export const availableWorkflowActionSchema = z.object({
  command: workflowCommandSchema,
  label: z.string(),
  enabled: z.boolean(),
  reason: z.string().optional()
});
export type AvailableWorkflowAction = z.infer<typeof availableWorkflowActionSchema>;
