import type { AgentRun } from "@dailycart/schemas";

export type SkillId =
  | "context-retrieval"
  | "interview-synthesis"
  | "support-ticket-clustering"
  | "analytics-anomaly-analysis"
  | "incident-to-regression-conversion"
  | "opportunity-generation"
  | "feature-prioritization"
  | "prd-generation"
  | "ux-review"
  | "engineering-feasibility-review"
  | "ticket-decomposition"
  | "dependency-mapping"
  | "implementation-planning"
  | "code-implementation"
  | "pull-request-preparation"
  | "eval-case-generation"
  | "rubric-authoring"
  | "release-readiness";

export interface SkillDefinition {
  id: SkillId;
  version: string;
  description: string;
  requiredContext: string[];
  allowedTools: string[];
  approvalPoint: "none" | "feature" | "release";
  evalCriteria: string[];
}

const skill = (id: SkillId, description: string, requiredContext: string[], allowedTools: string[], approvalPoint: SkillDefinition["approvalPoint"], evalCriteria: string[]): SkillDefinition => ({ id, version: "1.0.0", description, requiredContext, allowedTools, approvalPoint, evalCriteria });

export const skillRegistry: Record<SkillId, SkillDefinition> = {
  "context-retrieval": skill("context-retrieval", "Load the versioned company context pack and validate evidence references.", ["contextPackId", "manifest"], ["context-pack", "evidence-validator"], "none", ["all citations resolve", "pack version recorded"]),
  "interview-synthesis": skill("interview-synthesis", "Cluster interview transcripts into customer themes and conflicts.", ["interviews", "personas"], ["context-pack"], "none", ["theme support", "conflicts preserved"]),
  "support-ticket-clustering": skill("support-ticket-clustering", "Group support signals by recurrence, severity, and journey stage.", ["support tickets"], ["context-pack"], "none", ["severity retained", "evidence cited"]),
  "analytics-anomaly-analysis": skill("analytics-anomaly-analysis", "Compare product funnel observations and identify meaningful anomalies.", ["analytics observations", "funnel"], ["context-pack", "analytics"], "none", ["baseline compared", "sample size noted"]),
  "incident-to-regression-conversion": skill("incident-to-regression-conversion", "Turn an incident into an executable regression case and follow-up ticket.", ["incident", "postmortem"], ["incident-store", "evals"], "none", ["root cause linked", "case executable"]),
  "opportunity-generation": skill("opportunity-generation", "Generate bounded product opportunities from converging evidence.", ["evidence themes", "strategy"], ["context-pack"], "none", ["non-goals explicit", "evidence cited"]),
  "feature-prioritization": skill("feature-prioritization", "Rank opportunities by strength, recurrence, diversity, and confidence.", ["opportunities", "evidence"], ["context-pack"], "feature", ["ranking reproducible", "rationale grounded"]),
  "prd-generation": skill("prd-generation", "Produce a PM-owned implementation brief with measurable acceptance criteria.", ["approved opportunity", "evidence", "strategy"], ["context-pack", "lineage"], "feature", ["criteria testable", "metrics measurable"]),
  "ux-review": skill("ux-review", "Review interaction clarity, accessibility, recovery behavior, and content.", ["PM brief", "current product"], ["product-preview", "accessibility-rubric"], "feature", ["keyboard path covered", "risk actionable"]),
  "engineering-feasibility-review": skill("engineering-feasibility-review", "Bound implementation surfaces, risks, telemetry, and preview strategy.", ["PM brief", "repository"], ["github", "product-preview"], "feature", ["surfaces identified", "risks bounded"]),
  "ticket-decomposition": skill("ticket-decomposition", "Break an approved brief into independently deliverable tickets.", ["approved PM brief"], ["linear", "github"], "feature", ["acceptance linked", "owners assigned"]),
  "dependency-mapping": skill("dependency-mapping", "Map delivery ordering, blockers, and readiness checks.", ["tickets", "workstreams"], ["linear"], "none", ["cycles absent", "blockers explicit"]),
  "implementation-planning": skill("implementation-planning", "Plan workstreams without authoring or revising the PRD.", ["approved PM brief", "tickets"], ["linear", "github"], "none", ["TPM role boundary", "milestones present"]),
  "code-implementation": skill("code-implementation", "Change the product behind a feature flag and run relevant checks.", ["ticket", "repository", "acceptance criteria"], ["github", "test-runner"], "none", ["tests pass", "flag scoped"]),
  "pull-request-preparation": skill("pull-request-preparation", "Prepare an inspectable branch, commit, PR, checks, and preview request.", ["implementation result"], ["github", "vercel"], "none", ["links recorded", "diff scoped"]),
  "eval-case-generation": skill("eval-case-generation", "Create versioned cases from requirements, incidents, and acceptance criteria.", ["brief", "incident", "rubric"], ["eval-store"], "none", ["case executable", "criticality justified"]),
  "rubric-authoring": skill("rubric-authoring", "Define deterministic and semantic grading criteria with calibration labels.", ["acceptance criteria", "human labels"], ["eval-store", "langfuse"], "none", ["threshold explicit", "critical cases marked"]),
  "release-readiness": skill("release-readiness", "Verify preview evals, approvals, provider links, and deployment readiness.", ["preview eval", "approval", "checks"], ["vercel", "linear", "github"], "release", ["critical failures block", "human approval present"])
};

export function getSkillDefinition(id: string): SkillDefinition {
  const definition = skillRegistry[id as SkillId];
  if (!definition) throw new Error(`Unknown skill ${id}`);
  return definition;
}

export function annotateAgentRun(run: AgentRun, input: { skillId: SkillId; contextPackId?: string; featureBatchId?: string; citedEvidenceIds?: string[]; reasoningSummary?: string; toolCalls?: AgentRun["toolCalls"] }): AgentRun {
  const definition = getSkillDefinition(input.skillId);
  return { ...run, skillId: definition.id, skillVersion: definition.version, contextPackId: input.contextPackId, featureBatchId: input.featureBatchId, citedEvidenceIds: input.citedEvidenceIds ?? [], reasoningSummary: input.reasoningSummary, toolCalls: input.toolCalls ?? [] };
}
