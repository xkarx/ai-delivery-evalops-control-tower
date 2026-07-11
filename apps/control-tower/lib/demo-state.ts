import type { DemoState } from "@dailycart/schemas";

const base = "2026-07-10T16:00:00.000Z";

export const fallbackDemoState: DemoState = {
  generatedAt: "2026-07-10T18:30:00.000Z",
  seed: 20260710,
  scenario: "checkout-confidence",
  sourceMode: "synthetic",
  features: [
    { id: "FEAT-0001", title: "Checkout recovery guidance", problem: "Returning shoppers abandon checkout when promotion or address validation fails without an actionable explanation.", hypothesis: "Contextual recovery guidance will improve checkout completion while reducing support contacts.", evidenceIds: ["EVD-0003", "EVD-0011", "EVD-0024", "EVD-0037"], score: 91, confidence: 0.88, status: "released", workstream: "experience", metrics: ["Checkout completion", "Recovery success", "Support contacts"], sourceMode: "synthetic" },
    { id: "FEAT-0002", title: "Cart price-change transparency", problem: "Customers lose confidence when cart totals change after returning to a saved session.", hypothesis: "Showing an itemized price-change receipt will preserve trust and conversion.", evidenceIds: ["EVD-0008", "EVD-0019", "EVD-0042"], score: 78, confidence: 0.73, status: "candidate", workstream: "experience", metrics: ["Cart return rate", "Checkout start"], sourceMode: "synthetic" },
    { id: "FEAT-0003", title: "Recommendation timeout isolation", problem: "Recommendation latency can cascade into product-detail failures during peak traffic.", hypothesis: "A strict timeout and fallback will protect core browsing reliability.", evidenceIds: ["EVD-0028", "EVD-0032"], score: 84, confidence: 0.81, status: "in_delivery", workstream: "reliability", metrics: ["P95 product latency", "Error-free sessions"], sourceMode: "synthetic" }
  ],
  decisions: [{ id: "DEC-0001", featureId: "FEAT-0001", outcome: "approved", rationale: "Strong triangulation across interviews, support, and funnel evidence.", reviewer: "Demo product council", decidedAt: "2026-07-10T16:22:00.000Z", sourceMode: "simulated" }],
  tickets: [
    { id: "TKT-0001", featureId: "FEAT-0001", title: "Build recovery reason API", description: "Normalize checkout validation failures into actionable reason codes.", status: "done", workstream: "recovery-api", dependsOn: [], acceptanceCriteria: ["Reason code schema validates", "Unknown errors remain safe"], externalUrl: "https://github.com/xkarx/ai-delivery-evalops-control-tower/issues/1", sourceMode: "mocked" },
    { id: "TKT-0002", featureId: "FEAT-0001", title: "Render recovery guidance", description: "Map reason codes to accessible recovery actions in checkout.", status: "done", workstream: "checkout-ui", dependsOn: ["TKT-0001"], acceptanceCriteria: ["Keyboard accessible", "Analytics event emitted"], externalUrl: "https://github.com/xkarx/ai-delivery-evalops-control-tower/issues/2", sourceMode: "mocked" }
  ],
  approvals: [
    { id: "APR-0001", featureId: "FEAT-0001", stage: "feature", status: "approved", requestedAt: "2026-07-10T16:18:00.000Z", resolvedAt: "2026-07-10T16:22:00.000Z", reviewer: "Demo product council", rationale: "Evidence and scope accepted", sourceMode: "simulated" },
    { id: "APR-0002", featureId: "FEAT-0001", stage: "release", status: "approved", requestedAt: "2026-07-10T18:02:00.000Z", resolvedAt: "2026-07-10T18:12:00.000Z", reviewer: "Demo release manager", rationale: "Corrected campaign passed", sourceMode: "simulated" }
  ],
  runs: [
    { id: "RUN-0001", agent: "pm", status: "succeeded", startedAt: base, finishedAt: "2026-07-10T16:07:00.000Z", featureId: "FEAT-0001", ticketIds: [], traceId: "trace-pm-0001", costUsd: 0.083, latencyMs: 4210, retries: 0, steps: [{ name: "Retrieve evidence", status: "succeeded", durationMs: 620, detail: "47 evidence records scored" }, { name: "Cluster signals", status: "succeeded", durationMs: 1410, detail: "6 opportunity clusters" }, { name: "Rank opportunities", status: "succeeded", durationMs: 2180, detail: "Evidence-weighted ranking stored" }], sourceMode: "simulated" },
    { id: "RUN-0002", agent: "engineering", status: "succeeded", startedAt: "2026-07-10T16:42:00.000Z", finishedAt: "2026-07-10T17:18:00.000Z", featureId: "FEAT-0001", ticketIds: ["TKT-0001"], traceId: "trace-eng-0002", costUsd: 0.129, latencyMs: 19240, retries: 1, steps: [{ name: "Inspect", status: "succeeded", durationMs: 1240, detail: "Checkout service mapped" }, { name: "Implement", status: "succeeded", durationMs: 16400, detail: "Reason API and tests created" }, { name: "Test", status: "succeeded", durationMs: 1600, detail: "18 checks passed" }], sourceMode: "simulated" },
    { id: "RUN-0003", agent: "engineering", status: "succeeded", startedAt: "2026-07-10T16:42:00.000Z", finishedAt: "2026-07-10T17:25:00.000Z", featureId: "FEAT-0001", ticketIds: ["TKT-0002"], traceId: "trace-eng-0003", costUsd: 0.142, latencyMs: 22450, retries: 0, steps: [{ name: "Inspect", status: "succeeded", durationMs: 980, detail: "Checkout UI mapped" }, { name: "Implement", status: "succeeded", durationMs: 19520, detail: "Recovery panel built" }, { name: "Test", status: "succeeded", durationMs: 1950, detail: "Accessibility checks passed" }], sourceMode: "simulated" },
    { id: "RUN-0004", agent: "eval", status: "failed", startedAt: "2026-07-10T17:28:00.000Z", finishedAt: "2026-07-10T17:31:00.000Z", featureId: "FEAT-0001", ticketIds: ["TKT-0001", "TKT-0002"], traceId: "trace-eval-0004", costUsd: 0.031, latencyMs: 3100, retries: 0, steps: [{ name: "Regression suite", status: "failed", durationMs: 3100, detail: "Critical keyboard focus regression reproduced" }], sourceMode: "simulated" },
    { id: "RUN-0005", agent: "eval", status: "succeeded", startedAt: "2026-07-10T17:52:00.000Z", finishedAt: "2026-07-10T17:56:00.000Z", featureId: "FEAT-0001", ticketIds: ["TKT-0002"], traceId: "trace-eval-0005", costUsd: 0.032, latencyMs: 3380, retries: 0, steps: [{ name: "Regression suite", status: "succeeded", durationMs: 3380, detail: "Corrected focus behavior verified" }], sourceMode: "simulated" }
  ],
  campaigns: [
    { id: "EVAL-0001", featureId: "FEAT-0001", version: 1, status: "blocked", threshold: 85, weightedScore: 79, results: [{ caseId: "EVALCASE-0007", grader: "keyboard-focus-deterministic", score: 0, passed: false, rationale: "Focus moves behind the recovery dialog after retry.", measuredAt: "2026-07-10T17:31:00.000Z", durationMs: 188 }, { caseId: "EVALCASE-0011", grader: "evidence-grounding-mocked-judge", score: 92, passed: true, rationale: "Claims cite valid evidence from three source kinds.", measuredAt: "2026-07-10T17:31:00.000Z", durationMs: 880 }], failureCategories: ["accessibility/regression"], requiredApprovalPresent: true, releaseAllowed: false, runId: "RUN-0004", sourceMode: "simulated" },
    { id: "EVAL-0002", featureId: "FEAT-0001", version: 2, status: "passed", threshold: 85, weightedScore: 94, results: [{ caseId: "EVALCASE-0007", grader: "keyboard-focus-deterministic", score: 100, passed: true, rationale: "Focus remains within the recovery dialog and returns to retry.", measuredAt: "2026-07-10T17:56:00.000Z", durationMs: 194 }, { caseId: "EVALCASE-0011", grader: "evidence-grounding-mocked-judge", score: 92, passed: true, rationale: "Claims cite valid evidence from three source kinds.", measuredAt: "2026-07-10T17:56:00.000Z", durationMs: 891 }], failureCategories: [], requiredApprovalPresent: true, releaseAllowed: true, runId: "RUN-0005", sourceMode: "simulated" }
  ],
  deployments: [{ id: "DEP-0001", featureId: "FEAT-0001", environment: "production", status: "ready", commitSha: "7d91e2b", url: "https://demo.dailycart.invalid/releases/DEP-0001", deployedAt: "2026-07-10T18:18:00.000Z", sourceMode: "mocked" }],
  incidents: [{ id: "INC-0001", featureId: "FEAT-0001", title: "Recovery analytics duplicated on mobile retry", severity: "SEV-3", status: "resolved", detectedAt: "2026-07-10T18:25:00.000Z", rootCause: "Retry instrumentation registered twice after viewport transition.", regressionCaseId: "EVALCASE-0031", sourceMode: "simulated" }],
  lineage: [
    { id: "LIN-0001", sourceType: "evidence", sourceId: "EVD-0003", relationship: "supports", targetType: "feature", targetId: "FEAT-0001", createdAt: base, metadata: {} },
    { id: "LIN-0002", sourceType: "feature", sourceId: "FEAT-0001", relationship: "approved_by", targetType: "decision", targetId: "DEC-0001", createdAt: "2026-07-10T16:22:00.000Z", metadata: {} },
    { id: "LIN-0003", sourceType: "feature", sourceId: "FEAT-0001", relationship: "planned_as", targetType: "ticket", targetId: "TKT-0001", createdAt: "2026-07-10T16:31:00.000Z", metadata: {} },
    { id: "LIN-0004", sourceType: "ticket", sourceId: "TKT-0001", relationship: "executed_by", targetType: "run", targetId: "RUN-0002", createdAt: "2026-07-10T16:42:00.000Z", metadata: {} },
    { id: "LIN-0005", sourceType: "run", sourceId: "RUN-0004", relationship: "produced", targetType: "eval_campaign", targetId: "EVAL-0001", createdAt: "2026-07-10T17:31:00.000Z", metadata: {} },
    { id: "LIN-0006", sourceType: "eval_campaign", sourceId: "EVAL-0002", relationship: "gated", targetType: "deployment", targetId: "DEP-0001", createdAt: "2026-07-10T18:18:00.000Z", metadata: {} },
    { id: "LIN-0007", sourceType: "incident", sourceId: "INC-0001", relationship: "creates_regression_case", targetType: "eval_case", targetId: "EVALCASE-0031", createdAt: "2026-07-10T18:27:00.000Z", metadata: {} }
  ],
  integrations: ["github", "slack", "linear", "supabase", "langfuse", "posthog", "deployment", "workflow", "sample-product"].map((provider) => ({ provider: provider as DemoState["integrations"][number]["provider"], mode: "mock", status: "healthy", message: `Deterministic ${provider} adapter ready`, checkedAt: "2026-07-10T18:30:00.000Z", capabilities: ["health", "mock-read", "mock-write"] })),
  funnel: [{ stage: "Sessions", count: 2400 }, { stage: "Product views", count: 1812 }, { stage: "Cart adds", count: 922 }, { stage: "Checkout starts", count: 601 }, { stage: "Completed", count: 438 }],
  activity: [
    { at: "2026-07-10T18:27:00.000Z", type: "incident", title: "Regression case created", detail: "INC-0001 created EVALCASE-0031", entityId: "INC-0001" },
    { at: "2026-07-10T18:18:00.000Z", type: "deployment", title: "Production release recorded", detail: "DEP-0001 · mocked provider action", entityId: "DEP-0001" },
    { at: "2026-07-10T17:56:00.000Z", type: "eval", title: "Corrected campaign passed", detail: "EVAL-0002 scored 94 / 100", entityId: "EVAL-0002" },
    { at: "2026-07-10T17:31:00.000Z", type: "gate", title: "Release blocked", detail: "Critical accessibility regression in EVAL-0001", entityId: "EVAL-0001" },
    { at: "2026-07-10T16:22:00.000Z", type: "approval", title: "Feature approved", detail: "Human decision DEC-0001 recorded", entityId: "DEC-0001" }
  ]
};
