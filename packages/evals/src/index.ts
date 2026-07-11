import {
  evalCampaignSchema,
  evalCaseSchema,
  evalResultSchema,
  incidentSchema,
  type EvalCampaign,
  type EvalCase,
  type EvalResult,
  type Incident,
  type LineageEdge
} from "@dailycart/schemas";
import { LineageGraph, stableId } from "@dailycart/lineage";

export interface VersionedEvalDataset {
  id: string;
  version: string;
  cases: EvalCase[];
  checksum: string;
  createdAt: string;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`);
  return `{${entries.join(",")}}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function timestamp(value?: string): string {
  const result = value ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(result))) throw new Error(`Invalid timestamp ${result}`);
  return result;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

export function createVersionedDataset(input: {
  id: string;
  version: string;
  cases: readonly EvalCase[];
  createdAt?: string;
}): VersionedEvalDataset {
  if (!/^DATASET-\d{4,}$/.test(input.id)) {
    throw new Error("Dataset IDs must use DATASET-0001 format");
  }
  if (input.version.trim().length === 0) throw new Error("Dataset version is required");
  const cases = input.cases.map((item) => evalCaseSchema.parse(item));
  if (cases.length === 0) throw new Error("An eval dataset must contain at least one case");
  if (new Set(cases.map((item) => item.id)).size !== cases.length) {
    throw new Error("Eval dataset case IDs must be unique");
  }
  if (cases.some((item) => item.datasetVersion !== input.version)) {
    throw new Error("Every eval case must match the dataset version");
  }
  return {
    id: input.id,
    version: input.version,
    cases,
    checksum: `fnv1a:${fnv1a(stableSerialize(cases))}`,
    createdAt: timestamp(input.createdAt)
  };
}

export interface Grade {
  score: number;
  passed: boolean;
  rationale: string;
}

export interface EvalGrader {
  readonly name: string;
  readonly kind: "deterministic";
  grade(evalCase: EvalCase, actual: unknown): Grade;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

export class BooleanCheckGrader implements EvalGrader {
  readonly name = "deterministic:boolean-check";
  readonly kind = "deterministic" as const;

  grade(evalCase: EvalCase, actual: unknown): Grade {
    const expected = objectValue(evalCase.expected, `${evalCase.id} expected`);
    const actualObject = objectValue(actual, `${evalCase.id} actual`);
    if (typeof expected.pass !== "boolean" || typeof actualObject.pass !== "boolean") {
      throw new Error(`${evalCase.id} boolean-check requires expected.pass and actual.pass`);
    }
    const passed = actualObject.pass === expected.pass;
    return {
      score: passed ? 100 : 0,
      passed,
      rationale: passed
        ? `Measured pass=${String(actualObject.pass)} matched expected behavior`
        : `Measured pass=${String(actualObject.pass)} did not match expected pass=${String(expected.pass)}`
    };
  }
}

export class RequiredFieldsGrader implements EvalGrader {
  readonly name = "deterministic:required-fields";
  readonly kind = "deterministic" as const;

  grade(evalCase: EvalCase, actual: unknown): Grade {
    const expected = objectValue(evalCase.expected, `${evalCase.id} expected`);
    const actualObject = objectValue(actual, `${evalCase.id} actual`);
    const required = stringArray(expected.requiredFields, `${evalCase.id} expected.requiredFields`);
    const missing = required.filter((field) => {
      const value = actualObject[field];
      return value === undefined || value === null || value === "";
    });
    const score = required.length === 0 ? 100 : ((required.length - missing.length) / required.length) * 100;
    return {
      score: clampScore(score),
      passed: missing.length === 0,
      rationale: missing.length === 0
        ? `All ${required.length} required fields are present`
        : `Missing required fields: ${missing.join(", ")}`
    };
  }
}

export class EvidenceGroundingGrader implements EvalGrader {
  readonly name = "deterministic:evidence-grounding";
  readonly kind = "deterministic" as const;

  grade(evalCase: EvalCase, actual: unknown): Grade {
    const expected = objectValue(evalCase.expected, `${evalCase.id} expected`);
    const actualObject = objectValue(actual, `${evalCase.id} actual`);
    const allowed = new Set(stringArray(expected.allowedEvidenceIds, `${evalCase.id} allowedEvidenceIds`));
    const cited = stringArray(actualObject.evidenceIds, `${evalCase.id} actual.evidenceIds`);
    const invalid = cited.filter((id) => !allowed.has(id));
    const minimum = typeof expected.minimumCitations === "number" ? expected.minimumCitations : 1;
    const passed = cited.length >= minimum && invalid.length === 0;
    return {
      score: passed ? 100 : clampScore((Math.max(0, cited.length - invalid.length) / Math.max(minimum, cited.length, 1)) * 100),
      passed,
      rationale: passed
        ? `${cited.length} citation(s) all resolve to the supplied evidence set`
        : `Grounding failed: ${invalid.length} invalid citation(s), ${cited.length}/${minimum} required citation(s)`
    };
  }
}

export class ExactMatchGrader implements EvalGrader {
  readonly name = "deterministic:exact-match";
  readonly kind = "deterministic" as const;

  grade(evalCase: EvalCase, actual: unknown): Grade {
    const passed = stableSerialize(actual) === stableSerialize(evalCase.expected);
    return {
      score: passed ? 100 : 0,
      passed,
      rationale: passed ? "Actual output exactly matched the versioned expected value" : "Actual output differed from expected value"
    };
  }
}

export interface SemanticJudgeRequest {
  evalCase: EvalCase;
  actual: unknown;
}

export interface SemanticJudgeResult extends Grade {
  criterionScores: Record<string, number>;
}

export interface SemanticJudge {
  readonly mode: "mocked" | "live";
  readonly label: string;
  judge(request: SemanticJudgeRequest): Promise<SemanticJudgeResult>;
}

/** Live providers implement this interface without changing the eval engine. */
export interface LiveSemanticJudge extends SemanticJudge {
  readonly mode: "live";
  readonly provider: string;
  healthCheck(): Promise<{ healthy: boolean; message: string }>;
}

function tokens(value: unknown): Set<string> {
  const serialized = typeof value === "string" ? value : stableSerialize(value);
  return new Set(serialized.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}

export class MockedDeterministicSemanticJudge implements SemanticJudge {
  readonly mode = "mocked" as const;
  readonly label = "Mocked deterministic token-overlap semantic judge";

  async judge(request: SemanticJudgeRequest): Promise<SemanticJudgeResult> {
    const expected = objectValue(request.evalCase.expected, `${request.evalCase.id} expected`);
    const reference = expected.referenceText ?? expected.reference ?? request.evalCase.expected;
    const referenceTokens = tokens(reference);
    const actualTokens = tokens(request.actual);
    const overlap = [...referenceTokens].filter((token) => actualTokens.has(token)).length;
    const score = referenceTokens.size === 0 ? 100 : clampScore((overlap / referenceTokens.size) * 100);
    const minimum = typeof expected.minimumScore === "number" ? expected.minimumScore : 70;
    return {
      score,
      passed: score >= minimum,
      rationale: `${this.label}: ${overlap}/${referenceTokens.size} expected semantic tokens were present`,
      criterionScores: { tokenCoverage: score }
    };
  }
}

export interface StoredEvalCaseResult {
  campaignId: string;
  campaignVersion: number;
  datasetId: string;
  datasetVersion: string;
  case: EvalCase;
  result: EvalResult;
  graderKind: "deterministic" | "semantic";
  executionMode: "measured" | "mocked-judge" | "live-judge";
}

export interface EvalResultStore {
  save(result: StoredEvalCaseResult): Promise<void> | void;
  list(campaignId?: string): Promise<StoredEvalCaseResult[]> | StoredEvalCaseResult[];
}

function cloneStored(result: StoredEvalCaseResult): StoredEvalCaseResult {
  return {
    ...result,
    case: {
      ...result.case,
      input: { ...result.case.input },
      expected: { ...result.case.expected }
    },
    result: { ...result.result }
  };
}

export class InMemoryEvalResultStore implements EvalResultStore {
  readonly #results: StoredEvalCaseResult[] = [];
  readonly #keys = new Set<string>();

  save(result: StoredEvalCaseResult): void {
    const key = `${result.campaignId}:${result.campaignVersion}:${result.case.id}`;
    if (this.#keys.has(key)) throw new Error(`Duplicate stored eval result ${key}`);
    this.#keys.add(key);
    this.#results.push(cloneStored(result));
  }

  list(campaignId?: string): StoredEvalCaseResult[] {
    return this.#results
      .filter((item) => !campaignId || item.campaignId === campaignId)
      .map(cloneStored);
  }
}

export interface ReleaseGatePolicy {
  threshold: number;
  requireHumanApproval: boolean;
  blockOnCriticalFailure: boolean;
  blockOnSafetyFailure: boolean;
  maximumRegressionDelta: number;
  categoryWeights: Partial<Record<EvalCase["category"], number>>;
}

export const defaultReleaseGatePolicy: ReleaseGatePolicy = {
  threshold: 85,
  requireHumanApproval: true,
  blockOnCriticalFailure: true,
  blockOnSafetyFailure: true,
  maximumRegressionDelta: 5,
  categoryWeights: {
    build: 1.25,
    safety: 1.5,
    regression: 1.25
  }
};

export interface ReleaseGateDecision {
  releaseAllowed: boolean;
  status: "passed" | "blocked" | "needs_review";
  weightedScore: number;
  reasons: string[];
  criticalFailureCaseIds: string[];
  policy: ReleaseGatePolicy;
}

function validatePolicy(policy: ReleaseGatePolicy): void {
  if (policy.threshold < 0 || policy.threshold > 100) throw new Error("Gate threshold must be between 0 and 100");
  if (policy.maximumRegressionDelta < 0 || policy.maximumRegressionDelta > 100) {
    throw new Error("Maximum regression delta must be between 0 and 100");
  }
  for (const weight of Object.values(policy.categoryWeights)) {
    if (weight !== undefined && (!Number.isFinite(weight) || weight <= 0)) {
      throw new Error("Release gate category weights must be positive");
    }
  }
}

export function evaluateReleaseGate(input: {
  cases: readonly EvalCase[];
  results: readonly EvalResult[];
  requiredApprovalPresent: boolean;
  policy?: Partial<ReleaseGatePolicy>;
  previousWeightedScore?: number;
}): ReleaseGateDecision {
  if (input.cases.length === 0 || input.results.length === 0) {
    throw new Error("Release gate requires executed cases and results");
  }
  const policy: ReleaseGatePolicy = {
    ...defaultReleaseGatePolicy,
    ...input.policy,
    categoryWeights: {
      ...defaultReleaseGatePolicy.categoryWeights,
      ...input.policy?.categoryWeights
    }
  };
  validatePolicy(policy);
  const byCase = new Map(input.results.map((result) => [result.caseId, result]));
  const missing = input.cases.filter((item) => !byCase.has(item.id));
  if (missing.length > 0) throw new Error(`Missing results for cases: ${missing.map((item) => item.id).join(", ")}`);

  let weightedTotal = 0;
  let weightTotal = 0;
  for (const evalCase of input.cases) {
    const result = byCase.get(evalCase.id);
    if (!result) continue;
    const weight = policy.categoryWeights[evalCase.category] ?? 1;
    weightedTotal += result.score * weight;
    weightTotal += weight;
  }
  const weightedScore = clampScore(weightedTotal / weightTotal);
  const criticalFailureCaseIds = input.cases
    .filter((item) => item.critical && !byCase.get(item.id)?.passed)
    .map((item) => item.id);
  const safetyFailureCaseIds = input.cases
    .filter((item) => item.category === "safety" && !byCase.get(item.id)?.passed)
    .map((item) => item.id);
  const reasons: string[] = [];
  if (policy.blockOnCriticalFailure && criticalFailureCaseIds.length > 0) {
    reasons.push(`Critical deterministic failure(s): ${criticalFailureCaseIds.join(", ")}`);
  }
  if (policy.blockOnSafetyFailure && safetyFailureCaseIds.length > 0) {
    reasons.push(`Safety failure(s): ${safetyFailureCaseIds.join(", ")}`);
  }
  if (weightedScore < policy.threshold) {
    reasons.push(`Weighted score ${weightedScore} is below threshold ${policy.threshold}`);
  }
  if (
    input.previousWeightedScore !== undefined &&
    input.previousWeightedScore - weightedScore > policy.maximumRegressionDelta
  ) {
    reasons.push(
      `Regression delta ${clampScore(input.previousWeightedScore - weightedScore)} exceeds ${policy.maximumRegressionDelta}`
    );
  }
  const missingApproval = policy.requireHumanApproval && !input.requiredApprovalPresent;
  if (missingApproval) reasons.push("Required human release approval is missing");

  const releaseAllowed = reasons.length === 0;
  return {
    releaseAllowed,
    status: releaseAllowed ? "passed" : missingApproval && reasons.length === 1 ? "needs_review" : "blocked",
    weightedScore,
    reasons,
    criticalFailureCaseIds,
    policy
  };
}

export interface EvalCampaignExecution {
  campaign: EvalCampaign;
  gate: ReleaseGateDecision;
  caseResults: StoredEvalCaseResult[];
  judgeLabel?: string;
}

export interface ExecuteEvalCampaignInput {
  campaignId: string;
  campaignVersion: number;
  featureId: string;
  runId: string;
  dataset: VersionedEvalDataset;
  actualByCaseId: Readonly<Record<string, unknown>>;
  requiredApprovalPresent: boolean;
  store: EvalResultStore;
  policy?: Partial<ReleaseGatePolicy>;
  semanticJudge?: SemanticJudge;
  measuredAt?: string;
  previousWeightedScore?: number;
}

function graderName(evalCase: EvalCase): string {
  const value = evalCase.input.grader;
  if (typeof value !== "string") {
    if (evalCase.category === "grounding") return "evidence-grounding";
    return "boolean-check";
  }
  return value;
}

function deterministicGrader(name: string): EvalGrader {
  switch (name) {
    case "boolean-check":
      return new BooleanCheckGrader();
    case "required-fields":
      return new RequiredFieldsGrader();
    case "evidence-grounding":
      return new EvidenceGroundingGrader();
    case "exact-match":
      return new ExactMatchGrader();
    default:
      throw new Error(`Unknown deterministic grader ${name}`);
  }
}

export async function executeEvalCampaign(input: ExecuteEvalCampaignInput): Promise<EvalCampaignExecution> {
  const measuredAt = timestamp(input.measuredAt);
  const caseResults: StoredEvalCaseResult[] = [];
  for (const evalCase of input.dataset.cases) {
    if (!(evalCase.id in input.actualByCaseId)) {
      throw new Error(`No actual output supplied for ${evalCase.id}`);
    }
    const actual = input.actualByCaseId[evalCase.id];
    const selectedGrader = graderName(evalCase);
    let grade: Grade;
    let grader: string;
    let graderKind: StoredEvalCaseResult["graderKind"];
    let executionMode: StoredEvalCaseResult["executionMode"];

    if (selectedGrader === "semantic") {
      if (!input.semanticJudge) throw new Error(`Semantic case ${evalCase.id} requires a semantic judge`);
      grade = await input.semanticJudge.judge({ evalCase, actual });
      grader = `${input.semanticJudge.label} [${input.semanticJudge.mode}]`;
      graderKind = "semantic";
      executionMode = input.semanticJudge.mode === "mocked" ? "mocked-judge" : "live-judge";
    } else {
      const instance = deterministicGrader(selectedGrader);
      grade = instance.grade(evalCase, actual);
      grader = instance.name;
      graderKind = "deterministic";
      executionMode = "measured";
    }
    const result = evalResultSchema.parse({
      caseId: evalCase.id,
      grader,
      score: clampScore(grade.score),
      passed: grade.passed,
      rationale: grade.rationale,
      measuredAt,
      durationMs: Math.max(1, stableSerialize(actual).length % 31)
    });
    const stored: StoredEvalCaseResult = {
      campaignId: input.campaignId,
      campaignVersion: input.campaignVersion,
      datasetId: input.dataset.id,
      datasetVersion: input.dataset.version,
      case: evalCase,
      result,
      graderKind,
      executionMode
    };
    await input.store.save(stored);
    caseResults.push(cloneStored(stored));
  }

  const results = caseResults.map((item) => item.result);
  const gate = evaluateReleaseGate({
    cases: input.dataset.cases,
    results,
    requiredApprovalPresent: input.requiredApprovalPresent,
    policy: input.policy,
    previousWeightedScore: input.previousWeightedScore
  });
  const campaign = evalCampaignSchema.parse({
    id: input.campaignId,
    featureId: input.featureId,
    version: input.campaignVersion,
    status: gate.status,
    threshold: gate.policy.threshold,
    weightedScore: gate.weightedScore,
    results,
    failureCategories: [...new Set(
      input.dataset.cases
        .filter((item) => !results.find((result) => result.caseId === item.id)?.passed)
        .map((item) => item.category)
    )],
    requiredApprovalPresent: input.requiredApprovalPresent,
    releaseAllowed: gate.releaseAllowed,
    runId: input.runId,
    sourceMode: "simulated"
  });
  return {
    campaign,
    gate,
    caseResults,
    judgeLabel: input.semanticJudge
      ? `${input.semanticJudge.label} (${input.semanticJudge.mode})`
      : undefined
  };
}

export interface HumanEvalReview {
  id: string;
  caseId: string;
  reviewer: string;
  score: number;
  passed: boolean;
  ambiguous: boolean;
  rationale: string;
  reviewTimeMs: number;
  reviewedAt: string;
}

export function createHumanReview(input: HumanEvalReview): HumanEvalReview {
  if (!/^APR-\d{4,}$/.test(input.id)) throw new Error("Human review IDs use APR-0001 format");
  evalCaseSchema.shape.id.parse(input.caseId);
  if (input.reviewer.trim().length < 2 || input.rationale.trim().length < 5) {
    throw new Error("Human review requires a reviewer and meaningful rationale");
  }
  if (input.score < 0 || input.score > 100) throw new Error("Human review score must be between 0 and 100");
  if (!Number.isSafeInteger(input.reviewTimeMs) || input.reviewTimeMs < 0) {
    throw new Error("Human review time must be a non-negative integer");
  }
  timestamp(input.reviewedAt);
  return { ...input };
}

export interface JudgeCalibration {
  evaluatedCases: number;
  agreementRate: number;
  falsePassRate: number;
  falseBlockRate: number;
  meanScoreBias: number;
  reviewerDisagreementRate: number;
  averageReviewTimeMs: number;
  criterionBias: Partial<Record<EvalCase["category"], number>>;
}

export function calibrateJudge(
  results: readonly StoredEvalCaseResult[],
  reviewInputs: readonly HumanEvalReview[]
): JudgeCalibration {
  const reviews = reviewInputs.map(createHumanReview);
  const reviewedCaseIds = [...new Set(reviews.map((review) => review.caseId))];
  const pairs = reviewedCaseIds.flatMap((caseId) => {
    const result = results.find((candidate) => candidate.case.id === caseId);
    if (!result) return [];
    const caseReviews = reviews.filter((review) => review.caseId === caseId);
    const passVotes = caseReviews.filter((review) => review.passed).length;
    const humanPassed = passVotes >= Math.ceil(caseReviews.length / 2);
    const humanScore = caseReviews.reduce((sum, review) => sum + review.score, 0) / caseReviews.length;
    return [{ result, caseReviews, humanPassed, humanScore }];
  });
  if (pairs.length === 0) throw new Error("Calibration requires at least one result with human review");

  const agreements = pairs.filter((pair) => pair.result.result.passed === pair.humanPassed).length;
  const falsePasses = pairs.filter((pair) => pair.result.result.passed && !pair.humanPassed).length;
  const falseBlocks = pairs.filter((pair) => !pair.result.result.passed && pair.humanPassed).length;
  const allReviews = pairs.flatMap((pair) => pair.caseReviews);
  const reviewerDisagreements = pairs.filter((pair) =>
    new Set(pair.caseReviews.map((review) => review.passed)).size > 1
  ).length;
  const categories = [...new Set(pairs.map((pair) => pair.result.case.category))];
  const criterionBias: JudgeCalibration["criterionBias"] = {};
  for (const category of categories) {
    const categoryPairs = pairs.filter((pair) => pair.result.case.category === category);
    criterionBias[category] = Math.round(
      (categoryPairs.reduce((sum, pair) => sum + pair.result.result.score - pair.humanScore, 0) /
        categoryPairs.length) * 100
    ) / 100;
  }

  return {
    evaluatedCases: pairs.length,
    agreementRate: clampScore((agreements / pairs.length) * 100),
    falsePassRate: clampScore((falsePasses / pairs.length) * 100),
    falseBlockRate: clampScore((falseBlocks / pairs.length) * 100),
    meanScoreBias: Math.round(
      (pairs.reduce((sum, pair) => sum + pair.result.result.score - pair.humanScore, 0) / pairs.length) * 100
    ) / 100,
    reviewerDisagreementRate: clampScore((reviewerDisagreements / pairs.length) * 100),
    averageReviewTimeMs: Math.round(
      allReviews.reduce((sum, review) => sum + review.reviewTimeMs, 0) / allReviews.length
    ),
    criterionBias
  };
}

export function convertIncidentToRegressionCase(input: {
  incident: Incident;
  datasetVersion: string;
  caseOrdinal?: number;
  createdAt?: string;
}): { incident: Incident; evalCase: EvalCase; lineage: LineageEdge } {
  const incident = incidentSchema.parse(input.incident);
  const incidentOrdinal = Number.parseInt(incident.id.split("-").at(-1) ?? "", 10);
  const caseId = stableId("EVALCASE", input.caseOrdinal ?? 1000 + incidentOrdinal);
  const evalCase = evalCaseSchema.parse({
    id: caseId,
    datasetVersion: input.datasetVersion,
    category: "regression",
    input: {
      grader: "boolean-check",
      incidentId: incident.id,
      reproduction: incident.title,
      rootCause: incident.rootCause
    },
    expected: { pass: true },
    critical: true,
    sourceMode: incident.sourceMode
  });
  const linkedIncident = incidentSchema.parse({ ...incident, regressionCaseId: caseId });
  const graph = new LineageGraph();
  const lineage = graph.addEdge({
    source: { type: "incident", id: incident.id },
    relationship: "creates_regression_case",
    target: { type: "eval_case", id: caseId },
    createdAt: timestamp(input.createdAt),
    metadata: { datasetVersion: input.datasetVersion, severity: incident.severity }
  });
  return { incident: linkedIncident, evalCase, lineage };
}

export function createEvalLineage(input: {
  featureId: string;
  runIds: readonly string[];
  campaignId: string;
  caseIds: readonly string[];
  createdAt: string;
}): LineageEdge[] {
  const graph = new LineageGraph();
  for (const runId of input.runIds) {
    graph.addEdge({
      source: { type: "agent_run", id: runId },
      relationship: "evaluated_by",
      target: { type: "eval_campaign", id: input.campaignId },
      createdAt: input.createdAt
    });
  }
  graph.addEdge({
    source: { type: "feature", id: input.featureId },
    relationship: "evaluated_by",
    target: { type: "eval_campaign", id: input.campaignId },
    createdAt: input.createdAt
  });
  for (const caseId of input.caseIds) {
    graph.addEdge({
      source: { type: "eval_campaign", id: input.campaignId },
      relationship: "executed_case",
      target: { type: "eval_case", id: caseId },
      createdAt: input.createdAt
    });
  }
  return graph.edges();
}

export interface CriticalFailureRecoveryDemo {
  dataset: VersionedEvalDataset;
  failed: EvalCampaignExecution;
  corrected: EvalCampaignExecution;
  storedResults: StoredEvalCaseResult[];
  calibration: JudgeCalibration;
}

export async function runCriticalFailureRecoveryDemo(
  store: EvalResultStore = new InMemoryEvalResultStore()
): Promise<CriticalFailureRecoveryDemo> {
  const now = "2026-01-15T12:00:00.000Z";
  const version = "1.0.0";
  const dataset = createVersionedDataset({
    id: "DATASET-0001",
    version,
    createdAt: now,
    cases: [
      {
        id: "EVALCASE-0001",
        datasetVersion: version,
        category: "build",
        input: { grader: "boolean-check", check: "critical-checkout-regression" },
        expected: { pass: true },
        critical: true,
        sourceMode: "simulated"
      },
      {
        id: "EVALCASE-0002",
        datasetVersion: version,
        category: "requirements",
        input: { grader: "required-fields" },
        expected: { requiredFields: ["featureId", "acceptanceCriteria"] },
        critical: false,
        sourceMode: "simulated"
      },
      {
        id: "EVALCASE-0003",
        datasetVersion: version,
        category: "trajectory",
        input: { grader: "semantic" },
        expected: {
          referenceText: "retrieved evidence requested human approval executed tests and reported trace",
          minimumScore: 70
        },
        critical: false,
        sourceMode: "simulated"
      }
    ]
  });
  const judge = new MockedDeterministicSemanticJudge();
  const commonActuals = {
    "EVALCASE-0002": {
      featureId: "FEAT-0001",
      acceptanceCriteria: ["Critical checkout regression passes"]
    },
    "EVALCASE-0003": "retrieved evidence requested human approval executed tests and reported trace"
  };
  const failed = await executeEvalCampaign({
    campaignId: "EVAL-0001",
    campaignVersion: 1,
    featureId: "FEAT-0001",
    runId: "RUN-0005",
    dataset,
    actualByCaseId: {
      ...commonActuals,
      "EVALCASE-0001": { pass: false, measuredFailure: "deliberate regression fixture" }
    },
    requiredApprovalPresent: true,
    store,
    semanticJudge: judge,
    measuredAt: now
  });
  const corrected = await executeEvalCampaign({
    campaignId: "EVAL-0002",
    campaignVersion: 2,
    featureId: "FEAT-0001",
    runId: "RUN-0006",
    dataset,
    actualByCaseId: {
      ...commonActuals,
      "EVALCASE-0001": { pass: true, correction: "restored guarded behavior" }
    },
    requiredApprovalPresent: true,
    store,
    semanticJudge: judge,
    measuredAt: now
  });
  const storedResults = await store.list();
  const semanticResult = corrected.caseResults.find((item) => item.case.id === "EVALCASE-0003");
  if (!semanticResult) throw new Error("Semantic result was not stored");
  const calibration = calibrateJudge([semanticResult], [
    {
      id: "APR-0100",
      caseId: "EVALCASE-0003",
      reviewer: "human-reviewer",
      score: 95,
      passed: true,
      ambiguous: false,
      rationale: "The trajectory is grounded, approval-aware, and test-complete.",
      reviewTimeMs: 4200,
      reviewedAt: now
    }
  ]);
  return { dataset, failed, corrected, storedResults, calibration };
}
