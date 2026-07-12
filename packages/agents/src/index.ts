import {
  agentRunSchema,
  evidenceSchema,
  featureSchema,
  ticketSchema,
  type AgentRun,
  type Evidence,
  type Feature,
  type LineageEdge,
  type SourceMode,
  type Ticket
} from "@dailycart/schemas";
import { LineageGraph, stableId } from "@dailycart/lineage";
export { loadCompanyContextPack } from "./context-pack";
export type { CompanyContextManifest, CompanyContextPack, ContextPackCategory } from "./context-pack";
export { runLiveAgentReasoning } from "./live-runtime";
export type { LiveAgentReasoningInput, LiveAgentReasoningResult } from "./live-runtime";
export { annotateAgentRun, getSkillDefinition, skillRegistry } from "./skills";
export type { SkillDefinition, SkillId } from "./skills";

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "because",
  "been",
  "before",
  "being",
  "but",
  "could",
  "customer",
  "customers",
  "from",
  "have",
  "into",
  "more",
  "only",
  "other",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "using",
  "very",
  "want",
  "when",
  "where",
  "which",
  "with",
  "would"
]);

// Provenance and data-quality tags describe a signal, not a customer problem.
// Filtering them prevents a large source channel (for example, "support") from
// becoming a bogus product opportunity while leaving scenario themes dynamic.
const NON_OPPORTUNITY_TAGS = new Set([
  "ambiguous",
  "analytics",
  "bug",
  "confirmed-failure",
  "conflict",
  "discussion",
  "experiment",
  "feature-request",
  "incident",
  "inconclusive",
  "interview",
  "noisy",
  "support",
  "survey",
  "underpowered"
]);

const evidenceKindWeight: Record<Evidence["kind"], number> = {
  analytics: 4,
  incident: 4,
  support: 3.5,
  interview: 3,
  survey: 2.5,
  discussion: 1.5
};

const sentimentWeight: Record<Evidence["sentiment"], number> = {
  negative: 1.5,
  mixed: 1.2,
  neutral: 1,
  positive: 0.7
};

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function normalizeTheme(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanize(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function inferThemes(evidence: Evidence): string[] {
  const tags = evidence.tags
    .map(normalizeTheme)
    .filter((tag) => tag.length >= 3 && !NON_OPPORTUNITY_TAGS.has(tag));
  if (tags.length > 0) return [...new Set(tags)];

  const words = `${evidence.title} ${evidence.summary}`
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{3,}/g) ?? [];
  const candidates = words
    .filter((word) => !STOP_WORDS.has(word))
    .map(normalizeTheme)
    .filter(Boolean);
  return [...new Set(candidates)].slice(0, 3);
}

function extractOrdinal(id: string): number {
  const value = Number.parseInt(id.split("-").at(-1) ?? "", 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Unable to derive stable ordinal from ${id}`);
  }
  return value;
}

function isoNow(value?: string): string {
  const timestamp = value ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(timestamp))) throw new Error(`Invalid timestamp ${timestamp}`);
  return timestamp;
}

export interface EvidenceCitation {
  evidenceId: string;
  title: string;
  kind: Evidence["kind"];
  supportingExcerpt: string;
}

export interface OpportunityScoreBreakdown {
  evidenceStrength: number;
  sourceDiversity: number;
  recurrence: number;
  confidence: number;
}

export interface RankedOpportunity extends Feature {
  rank: number;
  theme: string;
  citations: EvidenceCitation[];
  scoreBreakdown: OpportunityScoreBreakdown;
}

export interface PmAnalysis {
  run: AgentRun;
  opportunities: RankedOpportunity[];
  /** PM-owned brief consumed by TPM; TPM never drafts or reviews this document. */
  implementationBrief: ProductRequirementDocument;
  evidenceIds: string[];
  themesEvaluated: string[];
  recommendationRationale: string;
}

export interface PmAnalysisOptions {
  maxOpportunities?: number;
  featureStartOrdinal?: number;
  runId?: string;
  now?: string;
  sourceMode?: SourceMode;
}

interface ThemeCluster {
  theme: string;
  evidence: Evidence[];
  rawStrength: number;
  kinds: Set<Evidence["kind"]>;
}

/**
 * Deterministically synthesizes the supplied evidence. No feature title,
 * evidence ID, or recommendation is fixed: changing the evidence changes the
 * clusters, scores, citations, and top-ranked opportunity.
 */
export function analyzeProductEvidence(
  rawEvidence: readonly Evidence[],
  options: PmAnalysisOptions = {}
): PmAnalysis {
  if (rawEvidence.length === 0) throw new Error("PM analysis requires evidence");
  const evidence = rawEvidence.map((item) => evidenceSchema.parse(item));
  if (new Set(evidence.map((item) => item.id)).size !== evidence.length) {
    throw new Error("PM analysis received duplicate evidence IDs");
  }

  const clusters = new Map<string, ThemeCluster>();
  for (const item of evidence) {
    for (const theme of inferThemes(item)) {
      const cluster = clusters.get(theme) ?? {
        theme,
        evidence: [],
        rawStrength: 0,
        kinds: new Set<Evidence["kind"]>()
      };
      if (!cluster.evidence.some((candidate) => candidate.id === item.id)) {
        cluster.evidence.push(item);
        cluster.rawStrength += evidenceKindWeight[item.kind] * sentimentWeight[item.sentiment];
        cluster.kinds.add(item.kind);
      }
      clusters.set(theme, cluster);
    }
  }
  if (clusters.size === 0) throw new Error("No analyzable themes could be derived from evidence");

  const ranked = [...clusters.values()]
    .map((cluster) => ({
      ...cluster,
      rawStrength:
        cluster.rawStrength +
        cluster.kinds.size * 2 +
        Math.log2(cluster.evidence.length + 1) * 3
    }))
    .sort((left, right) =>
      right.rawStrength - left.rawStrength ||
      right.evidence.length - left.evidence.length ||
      left.theme.localeCompare(right.theme)
    );
  const maximumStrength = ranked[0]?.rawStrength ?? 1;
  const maxOpportunities = Math.min(
    Math.max(1, options.maxOpportunities ?? 5),
    ranked.length
  );
  const sourceMode = options.sourceMode ?? evidence[0]?.sourceMode ?? "synthetic";
  const featureStartOrdinal = options.featureStartOrdinal ?? 1;

  const opportunities = ranked.slice(0, maxOpportunities).map((cluster, index): RankedOpportunity => {
    const evidenceIds = cluster.evidence.map((item) => item.id).sort();
    const score = round(40 + (cluster.rawStrength / maximumStrength) * 55, 1);
    const confidence = round(
      Math.min(
        0.98,
        0.25 +
          (cluster.evidence.length / evidence.length) * 0.4 +
          Math.min(cluster.kinds.size, 4) * 0.08
      )
    );
    const themeTitle = humanize(cluster.theme);
    const summarySample = cluster.evidence
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, 2)
      .map((item) => item.summary.replace(/\s+/g, " ").trim())
      .join(" ");
    const feature = featureSchema.parse({
      id: stableId("FEAT", featureStartOrdinal + index),
      title: `Improve ${themeTitle}`,
      problem: `${cluster.evidence.length} evidence item(s) indicate recurring ${themeTitle.toLowerCase()} friction. ${summarySample}`,
      hypothesis: `If DailyCart improves ${themeTitle.toLowerCase()}, affected customers will complete their intended journey more reliably.`,
      evidenceIds,
      score,
      confidence,
      status: index === 0 ? "awaiting_approval" : "candidate",
      workstream: cluster.kinds.has("incident") ? "reliability" : "experience",
      metrics: [
        `${cluster.theme.replace(/-/g, "_")}_success_rate`,
        `${cluster.theme.replace(/-/g, "_")}_related_support_rate`
      ],
      sourceMode
    });

    return {
      ...feature,
      rank: index + 1,
      theme: cluster.theme,
      citations: cluster.evidence
        .slice()
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((item) => ({
          evidenceId: item.id,
          title: item.title,
          kind: item.kind,
          supportingExcerpt: item.summary.slice(0, 180)
        })),
      scoreBreakdown: {
        evidenceStrength: round(cluster.rawStrength),
        sourceDiversity: cluster.kinds.size,
        recurrence: cluster.evidence.length,
        confidence
      }
    };
  });

  const timestamp = isoNow(options.now);
  const runId = options.runId ?? "RUN-0001";
  const run = agentRunSchema.parse({
    id: runId,
    agent: "pm",
    status: "waiting_approval",
    startedAt: timestamp,
    finishedAt: timestamp,
    featureId: opportunities[0]?.id,
    ticketIds: [],
    traceId: `trace-${runId.toLowerCase()}`,
    costUsd: 0,
    latencyMs: evidence.length * 3 + clusters.size,
    retries: 0,
    steps: [
      {
        name: "validate-evidence",
        status: "succeeded",
        durationMs: evidence.length,
        detail: `Validated ${evidence.length} unique evidence records`
      },
      {
        name: "cluster-opportunities",
        status: "succeeded",
        durationMs: clusters.size * 2,
        detail: `Derived ${clusters.size} themes from supplied tags and text`
      },
      {
        name: "rank-and-cite",
        status: "succeeded",
        durationMs: opportunities.length,
        detail: `Ranked ${opportunities.length} opportunities with input evidence citations`
      }
    ],
    sourceMode
  });

  const recommended = opportunities[0];
  if (!recommended) throw new Error("PM analysis did not produce a recommendation");
  const implementationBrief = createImplementationBrief(recommended, { now: timestamp });
  return {
    run,
    opportunities,
    implementationBrief,
    evidenceIds: evidence.map((item) => item.id).sort(),
    themesEvaluated: [...clusters.keys()].sort(),
    recommendationRationale:
      `${recommended.title} ranks first because ${recommended.scoreBreakdown.recurrence} supplied evidence item(s) ` +
      `span ${recommended.scoreBreakdown.sourceDiversity} source type(s); cited IDs: ${recommended.evidenceIds.join(", ")}.`
  };
}

export interface ProductRequirementDocument {
  id: string;
  featureId: string;
  title: string;
  problem: string;
  objective: string;
  evidenceIds: string[];
  inScope: string[];
  nonGoals: string[];
  userStories: string[];
  metrics: string[];
  acceptanceCriteria: string[];
  createdAt: string;
  sourceMode: SourceMode;
}

/** Creates the PM-owned implementation brief from the selected opportunity. */
export function createImplementationBrief(
  featureInput: Feature,
  options: { briefOrdinal?: number; now?: string } = {}
): ProductRequirementDocument {
  const feature = featureSchema.parse(featureInput);
  const timestamp = isoNow(options.now);
  const featureOrdinal = extractOrdinal(feature.id);
  return {
    id: stableId("PRD", options.briefOrdinal ?? featureOrdinal),
    featureId: feature.id,
    title: `${feature.title} — implementation brief`,
    problem: feature.problem,
    objective: feature.hypothesis,
    evidenceIds: [...feature.evidenceIds],
    inScope: [
      `Deliver the core ${feature.title.toLowerCase()} user journey`,
      "Instrument success, failure, and exposure events",
      "Protect the journey with deterministic regression coverage"
    ],
    nonGoals: [
      "Unrelated product-area redesigns",
      "Multi-tenant policy customization reserved for V2"
    ],
    userStories: [
      `As an affected shopper, I can use ${feature.title.toLowerCase()} without avoidable friction.`,
      "As a product operator, I can measure adoption and failures by persistent customer ID."
    ],
    metrics: [...feature.metrics],
    acceptanceCriteria: [
      `The primary ${feature.title.toLowerCase()} journey completes in supported demo scenarios.`,
      `Every outcome emits ${feature.metrics[0] ?? "a success"} telemetry with a feature ID.`,
      "Critical deterministic and regression eval cases pass before release."
    ],
    createdAt: timestamp,
    sourceMode: feature.sourceMode
  };
}

export interface DeliveryRisk {
  id: string;
  description: string;
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  mitigation: string;
  owner: string;
}

export interface DeliveryDependency {
  id: string;
  predecessorTicketIds: string[];
  successorTicketId: string;
  reason: string;
}

export interface DeliveryMilestone {
  id: string;
  name: string;
  exitCriteria: string[];
  ticketIds: string[];
}

export interface TpmPlan {
  run: AgentRun;
  implementationBrief: ProductRequirementDocument;
  tickets: Ticket[];
  dependencies: DeliveryDependency[];
  risks: DeliveryRisk[];
  milestones: DeliveryMilestone[];
}

export interface TpmPlanOptions {
  implementationBrief: ProductRequirementDocument;
  ticketStartOrdinal?: number;
  runId?: string;
  now?: string;
}

export function createTpmPlan(featureInput: Feature, options: TpmPlanOptions): TpmPlan {
  const feature = featureSchema.parse(featureInput);
  if (feature.status !== "approved") {
    throw new Error(`TPM planning requires an approved feature; received ${feature.status}`);
  }
  const timestamp = isoNow(options.now);
  const implementationBrief = options.implementationBrief;
  if (!implementationBrief || implementationBrief.featureId !== feature.id) {
    throw new Error("TPM planning requires a PM-owned implementation brief for the approved feature");
  }
  if (implementationBrief.sourceMode !== feature.sourceMode) {
    throw new Error("PM implementation brief and approved feature must use the same source mode");
  }
  const featureOrdinal = extractOrdinal(feature.id);
  const ticketStart = options.ticketStartOrdinal ?? (featureOrdinal - 1) * 3 + 1;
  const ticketIds = [0, 1, 2].map((offset) => stableId("TKT", ticketStart + offset));
  const [experienceTicketId, reliabilityTicketId, integrationTicketId] = ticketIds;
  if (!experienceTicketId || !reliabilityTicketId || !integrationTicketId) {
    throw new Error("Unable to allocate TPM ticket IDs");
  }

  const tickets = [
    ticketSchema.parse({
      id: experienceTicketId,
      featureId: feature.id,
      title: `Implement ${feature.title} core journey`,
      description: `Build the approved behavior described by ${implementationBrief.id} and preserve evidence-linked scope.`,
      status: "todo",
      workstream: "experience",
      dependsOn: [],
      acceptanceCriteria: [implementationBrief.acceptanceCriteria[0]],
      sourceMode: feature.sourceMode
    }),
    ticketSchema.parse({
      id: reliabilityTicketId,
      featureId: feature.id,
      title: `Instrument and harden ${feature.title}`,
      description: `Add telemetry, error handling, and deterministic regression coverage for ${implementationBrief.id}.`,
      status: "todo",
      workstream: "reliability",
      dependsOn: [],
      acceptanceCriteria: implementationBrief.acceptanceCriteria.slice(1),
      sourceMode: feature.sourceMode
    }),
    ticketSchema.parse({
      id: integrationTicketId,
      featureId: feature.id,
      title: `Integrate ${feature.title} and verify readiness`,
      description: "Combine the two independently executable workstreams and prepare the preview gate.",
      status: "todo",
      workstream: "integration",
      dependsOn: [experienceTicketId, reliabilityTicketId],
      acceptanceCriteria: ["Both predecessor checks pass and the preview links to the approved feature."],
      sourceMode: feature.sourceMode
    })
  ];
  const runId = options.runId ?? "RUN-0002";
  const run = agentRunSchema.parse({
    id: runId,
    agent: "tpm",
    status: "succeeded",
    startedAt: timestamp,
    finishedAt: timestamp,
    featureId: feature.id,
    ticketIds,
    traceId: `trace-${runId.toLowerCase()}`,
    costUsd: 0,
    latencyMs: 24,
    retries: 0,
    steps: [
      {
        name: "consume-pm-brief",
        status: "succeeded",
        durationMs: 8,
        detail: `Consumed PM-owned ${implementationBrief.id}; preserved ${implementationBrief.evidenceIds.length} evidence links`
      },
      {
        name: "decompose-work",
        status: "succeeded",
        durationMs: 8,
        detail: "Created two parallel workstreams and one dependent integration ticket"
      },
      {
        name: "map-dependencies-and-risk",
        status: "succeeded",
        durationMs: 8,
        detail: "Recorded delivery, measurement, and scope risks"
      },
      {
        name: "prepare-delivery-readiness",
        status: "succeeded",
        durationMs: 8,
        detail: "Prepared integration gate, ownership, and release-readiness checklist"
      }
    ],
    sourceMode: feature.sourceMode
  });

  return {
    run,
    implementationBrief,
    tickets,
    dependencies: [
      {
        id: "DEPENDENCY-0001",
        predecessorTicketIds: [experienceTicketId, reliabilityTicketId],
        successorTicketId: integrationTicketId,
        reason: "Integration and readiness verification require both independent workstreams."
      }
    ],
    risks: [
      {
        id: "RISK-0001",
        description: `The ${feature.title.toLowerCase()} change could regress the current journey.`,
        probability: "medium",
        impact: "high",
        mitigation: "Run a critical regression case and block release on failure.",
        owner: "engineering"
      },
      {
        id: "RISK-0002",
        description: "Telemetry could make an apparent improvement impossible to verify.",
        probability: "medium",
        impact: "medium",
        mitigation: `Validate ${feature.metrics.join(" and ")} before preview approval.`,
        owner: "product-analytics"
      },
      {
        id: "RISK-0003",
        description: "Implementation may expand beyond the evidence-supported problem.",
        probability: "low",
        impact: "medium",
        mitigation: `Keep all changed work linked to ${implementationBrief.id} acceptance criteria.`,
        owner: "tpm"
      }
    ],
    milestones: [
      {
        id: "MILESTONE-0001",
        name: "Parallel implementation complete",
        exitCriteria: ["Core journey checks pass", "Telemetry and regression checks execute"],
        ticketIds: [experienceTicketId, reliabilityTicketId]
      },
      {
        id: "MILESTONE-0002",
        name: "Preview ready for evaluation",
        exitCriteria: ["Integration ticket complete", "Critical release policy evaluated"],
        ticketIds: [integrationTicketId]
      }
    ]
  };
}

export type ReviewSeverity = "info" | "warning" | "critical";
export type AgentReviewType = "ux" | "engineering-feasibility";

export interface AgentReviewFinding {
  id: string;
  severity: ReviewSeverity;
  title: string;
  detail: string;
  recommendation: string;
}

/** A review is an inspectable AgentRun, not an implicit TPM approval. */
export interface AgentReviewSummary {
  id: string;
  featureId: string;
  reviewType: AgentReviewType;
  status: "passed" | "needs_changes";
  findings: AgentReviewFinding[];
  run: AgentRun;
  sourceMode: SourceMode;
}

export interface AgentReviewOptions {
  runId?: string;
  reviewId?: string;
  now?: string;
  sourceMode?: SourceMode;
}

function createReviewSummary(
  featureInput: Feature,
  briefInput: ProductRequirementDocument,
  reviewType: AgentReviewType,
  findings: AgentReviewFinding[],
  options: AgentReviewOptions,
  agent: "ux" | "engineering_feasibility",
  defaultRunId: string,
  defaultReviewId: string
): AgentReviewSummary {
  const feature = featureSchema.parse(featureInput);
  const brief = briefInput;
  if (brief.featureId !== feature.id) throw new Error("Review brief must belong to the reviewed feature");
  const sourceMode = options.sourceMode ?? feature.sourceMode;
  const timestamp = isoNow(options.now);
  const status = findings.some((finding) => finding.severity === "critical") ? "needs_changes" : "passed";
  const runId = options.runId ?? defaultRunId;
  const run = agentRunSchema.parse({
    id: runId,
    agent,
    status: status === "passed" ? "succeeded" : "failed",
    startedAt: timestamp,
    finishedAt: timestamp,
    featureId: feature.id,
    ticketIds: [],
    traceId: `trace-${runId.toLowerCase()}`,
    costUsd: 0,
    latencyMs: Math.max(1, findings.length * 4),
    retries: 0,
    steps: [
      { name: `review-${reviewType}`, status: status === "passed" ? "succeeded" : "failed", durationMs: Math.max(1, findings.length * 4), detail: `${findings.length} deterministic finding(s) recorded` },
      { name: "record-findings", status: "succeeded", durationMs: 1, detail: "Findings are linked to the PM-owned implementation brief" }
    ],
    sourceMode
  });
  return { id: options.reviewId ?? defaultReviewId, featureId: feature.id, reviewType, status, findings, run, sourceMode };
}

export function runUxReview(featureInput: Feature, briefInput: ProductRequirementDocument, options: AgentReviewOptions = {}): AgentReviewSummary {
  const brief = briefInput;
  const findings: AgentReviewFinding[] = [];
  if (brief.userStories.length === 0) findings.push({ id: "EXT-0201", severity: "critical", title: "No user story", detail: "The brief has no user-centered outcome to validate.", recommendation: "Add a user story before delivery planning." });
  if (brief.acceptanceCriteria.length < 3) findings.push({ id: "EXT-0202", severity: "critical", title: "Acceptance coverage is incomplete", detail: "Fewer than three observable acceptance criteria are defined.", recommendation: "Add success, telemetry, and regression criteria." });
  if (brief.metrics.length === 0) findings.push({ id: "EXT-0203", severity: "warning", title: "Outcome metric is missing", detail: "The experience cannot be evaluated against a measurable outcome.", recommendation: "Define at least one customer-facing metric." });
  if (findings.length === 0) findings.push({ id: "EXT-0204", severity: "info", title: "Journey is reviewable", detail: "User stories and observable acceptance criteria are present.", recommendation: "Validate the journey with human review at preview." });
  return createReviewSummary(featureInput, brief, "ux", findings, options, "ux", "RUN-0110", "EXT-0200");
}

export function runEngineeringFeasibilityReview(featureInput: Feature, briefInput: ProductRequirementDocument, options: AgentReviewOptions = {}): AgentReviewSummary {
  const brief = briefInput;
  const findings: AgentReviewFinding[] = [];
  if (brief.inScope.length > 5) findings.push({ id: "EXT-0211", severity: "critical", title: "Scope is too broad", detail: `${brief.inScope.length} in-scope items exceed the bounded V1 review budget.`, recommendation: "Split the change into independent workstreams." });
  if (brief.nonGoals.length === 0) findings.push({ id: "EXT-0212", severity: "warning", title: "Non-goals are undefined", detail: "Without non-goals, delivery scope can expand during implementation.", recommendation: "Record explicit exclusions before ticket decomposition." });
  if (brief.evidenceIds.length === 0) findings.push({ id: "EXT-0213", severity: "critical", title: "Evidence linkage is missing", detail: "The implementation brief cannot be traced to source evidence.", recommendation: "Link the brief to at least one validated evidence ID." });
  if (findings.length === 0) findings.push({ id: "EXT-0214", severity: "info", title: "Implementation is bounded", detail: "Scope, exclusions, metrics, and evidence links are present.", recommendation: "Proceed to TPM dependency mapping and readiness checks." });
  return createReviewSummary(featureInput, brief, "engineering-feasibility", findings, options, "engineering_feasibility", "RUN-0111", "EXT-0210");
}

export interface EngineeringExecutionStep {
  name: string;
  status: "succeeded" | "failed" | "blocked";
  durationMs: number;
  detail: string;
}

export interface EngineeringExecutionResult {
  status: "succeeded" | "failed" | "blocked";
  startedAt: string;
  finishedAt: string;
  branch: string;
  commitSha?: string;
  pullRequestId?: string;
  pullRequestUrl?: string;
  steps: EngineeringExecutionStep[];
  checks: Array<{ name: string; passed: boolean; measured: boolean }>;
  retries: number;
  costUsd: number;
}

export interface EngineeringExecutionRequest {
  ticket: Ticket;
  feature: Feature;
  branch: string;
  workstreamIndex: number;
}

export interface EngineeringExecutor {
  readonly mode: "mocked" | "live";
  readonly label: string;
  execute(request: EngineeringExecutionRequest): Promise<EngineeringExecutionResult>;
}

export class DeterministicMockEngineeringExecutor implements EngineeringExecutor {
  readonly mode = "mocked" as const;
  readonly label = "Mocked deterministic engineering executor";
  readonly #now: string;

  constructor(now = "2026-01-15T12:00:00.000Z") {
    this.#now = isoNow(now);
  }

  async execute(request: EngineeringExecutionRequest): Promise<EngineeringExecutionResult> {
    const ticketOrdinal = extractOrdinal(request.ticket.id);
    return {
      status: "succeeded",
      startedAt: this.#now,
      finishedAt: this.#now,
      branch: request.branch,
      commitSha: ticketOrdinal.toString(16).padStart(40, "0"),
      pullRequestId: stableId("PR", ticketOrdinal),
      pullRequestUrl: `https://example.invalid/mock/pull/${ticketOrdinal}`,
      steps: [
        {
          name: "inspect",
          status: "succeeded",
          durationMs: 4,
          detail: `Inspected scope for ${request.ticket.id}`
        },
        {
          name: "implement",
          status: "succeeded",
          durationMs: 12,
          detail: `Executed mocked change for ${request.ticket.workstream}; no live repository mutation claimed`
        },
        {
          name: "test",
          status: "succeeded",
          durationMs: 6,
          detail: "Executed deterministic mock checks"
        },
        {
          name: "prepare-pr",
          status: "succeeded",
          durationMs: 3,
          detail: `Recorded mocked PR ${stableId("PR", ticketOrdinal)}`
        }
      ],
      checks: [
        { name: "scope", passed: true, measured: true },
        { name: "unit", passed: true, measured: true }
      ],
      retries: 0,
      costUsd: 0
    };
  }
}

export interface EngineeringWorkstreamRecord {
  ticketId: string;
  workstream: string;
  run: AgentRun;
  branch: string;
  commitSha?: string;
  pullRequestId?: string;
  pullRequestUrl?: string;
  checks: Array<{ name: string; passed: boolean; measured: boolean }>;
  executorLabel: string;
}

export interface ExecuteWorkstreamsOptions {
  executor?: EngineeringExecutor;
  runStartOrdinal?: number;
}

/** Executes the first two dependency-free, distinct workstreams concurrently. */
export async function executeIndependentEngineeringWorkstreams(
  featureInput: Feature,
  ticketInputs: readonly Ticket[],
  options: ExecuteWorkstreamsOptions = {}
): Promise<EngineeringWorkstreamRecord[]> {
  const feature = featureSchema.parse(featureInput);
  const tickets = ticketInputs.map((ticket) => ticketSchema.parse(ticket));
  const independent = tickets
    .filter((ticket) => ticket.dependsOn.length === 0)
    .filter((ticket, index, values) =>
      values.findIndex((candidate) => candidate.workstream === ticket.workstream) === index
    )
    .slice(0, 2);
  if (independent.length < 2) {
    throw new Error("Two dependency-free tickets in distinct workstreams are required");
  }
  const executor = options.executor ?? new DeterministicMockEngineeringExecutor();
  const runStart = options.runStartOrdinal ?? 3;

  return Promise.all(independent.map(async (ticket, index): Promise<EngineeringWorkstreamRecord> => {
    const branch = `agent/${ticket.id.toLowerCase()}-${normalizeTheme(ticket.workstream)}`;
    const measured = await executor.execute({ ticket, feature, branch, workstreamIndex: index });
    if (measured.branch !== branch) {
      throw new Error(`Executor returned branch ${measured.branch}; expected isolated branch ${branch}`);
    }
    const checksPassed = measured.checks.every((check) => check.measured && check.passed);
    const status = measured.status === "succeeded" && !checksPassed ? "failed" : measured.status;
    const runId = stableId("RUN", runStart + index);
    const latencyMs = measured.steps.reduce((sum, step) => sum + step.durationMs, 0);
    const run = agentRunSchema.parse({
      id: runId,
      agent: "engineering",
      status,
      startedAt: measured.startedAt,
      finishedAt: measured.finishedAt,
      featureId: feature.id,
      ticketIds: [ticket.id],
      traceId: `trace-${runId.toLowerCase()}`,
      costUsd: measured.costUsd,
      latencyMs,
      retries: measured.retries,
      steps: measured.steps,
      sourceMode: executor.mode
    });
    return {
      ticketId: ticket.id,
      workstream: ticket.workstream,
      run,
      branch,
      commitSha: measured.commitSha,
      pullRequestId: measured.pullRequestId,
      pullRequestUrl: measured.pullRequestUrl,
      checks: measured.checks.map((check) => ({ ...check })),
      executorLabel: executor.label
    };
  }));
}

export function createPlanningAndDeliveryLineage(input: {
  evidenceIds: readonly string[];
  featureId: string;
  decisionId: string;
  prdId: string;
  tickets: readonly Ticket[];
  workstreams: readonly EngineeringWorkstreamRecord[];
  createdAt: string;
}): LineageEdge[] {
  const graph = new LineageGraph();
  for (const evidenceId of input.evidenceIds) {
    graph.addEdge({
      source: { type: "evidence", id: evidenceId },
      relationship: "supports",
      target: { type: "feature", id: input.featureId },
      createdAt: input.createdAt
    });
  }
  graph.addEdge({
    source: { type: "feature", id: input.featureId },
    relationship: "approved_by",
    target: { type: "decision", id: input.decisionId },
    createdAt: input.createdAt
  });
  graph.addEdge({
    source: { type: "feature", id: input.featureId },
    relationship: "specified_by",
    target: { type: "prd", id: input.prdId },
    createdAt: input.createdAt
  });
  for (const ticket of input.tickets) {
    graph.addEdge({
      source: { type: "prd", id: input.prdId },
      relationship: "decomposed_into",
      target: { type: "ticket", id: ticket.id },
      createdAt: input.createdAt,
      metadata: { workstream: ticket.workstream, dependsOn: ticket.dependsOn }
    });
  }
  for (const record of input.workstreams) {
    graph.addEdge({
      source: { type: "ticket", id: record.ticketId },
      relationship: "executed_by",
      target: { type: "agent_run", id: record.run.id },
      createdAt: input.createdAt,
      metadata: { branch: record.branch, executor: record.executorLabel }
    });
    if (record.pullRequestId) {
      graph.addEdge({
        source: { type: "agent_run", id: record.run.id },
        relationship: "produced",
        target: { type: "pull_request", id: record.pullRequestId },
        createdAt: input.createdAt,
        metadata: { url: record.pullRequestUrl }
      });
    }
  }
  return graph.edges();
}
