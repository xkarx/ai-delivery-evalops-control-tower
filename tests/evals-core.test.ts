import { describe, expect, it } from "vitest";
import type { EvalCase, EvalResult, Incident } from "../packages/schemas/src/index";
import {
  InMemoryEvalResultStore,
  MockedDeterministicSemanticJudge,
  calibrateJudge,
  convertIncidentToRegressionCase,
  createHumanReview,
  createVersionedDataset,
  evaluateReleaseGate,
  runCriticalFailureRecoveryDemo
} from "../packages/evals/src/index";

const now = "2026-01-15T12:00:00.000Z";

describe("real deterministic eval execution", () => {
  it("stores every measured case, blocks a deliberate critical failure, and passes the corrected rerun", async () => {
    const store = new InMemoryEvalResultStore();
    const demo = await runCriticalFailureRecoveryDemo(store);

    expect(demo.failed.campaign.releaseAllowed).toBe(false);
    expect(demo.failed.campaign.status).toBe("blocked");
    expect(demo.failed.gate.criticalFailureCaseIds).toContain("EVALCASE-0001");
    expect(demo.failed.gate.reasons.join(" ")).toMatch(/critical deterministic failure/i);

    expect(demo.corrected.campaign.releaseAllowed).toBe(true);
    expect(demo.corrected.campaign.status).toBe("passed");
    expect(demo.corrected.campaign.results.every((result) => result.passed)).toBe(true);

    expect(demo.storedResults).toHaveLength(demo.dataset.cases.length * 2);
    expect(new Set(demo.storedResults.map((item) =>
      `${item.campaignId}:${item.campaignVersion}:${item.case.id}`
    )).size).toBe(demo.storedResults.length);
    const semanticResults = demo.storedResults.filter((item) => item.graderKind === "semantic");
    expect(semanticResults.every((item) => item.executionMode === "mocked-judge")).toBe(true);
    expect(semanticResults.every((item) => item.result.grader.includes("[mocked]"))).toBe(true);
    expect(demo.calibration.agreementRate).toBe(100);
  });

  it("exposes a deterministic mocked semantic judge without mislabeling it as live", async () => {
    const judge = new MockedDeterministicSemanticJudge();
    const result = await judge.judge({
      evalCase: {
        id: "EVALCASE-0010",
        datasetVersion: "1.0.0",
        category: "trajectory",
        input: { grader: "semantic" },
        expected: { referenceText: "evidence approval tests trace", minimumScore: 75 },
        critical: false,
        sourceMode: "simulated"
      },
      actual: "evidence approval tests trace"
    });
    expect(judge.mode).toBe("mocked");
    expect(judge.label).toMatch(/^Mocked/);
    expect(result.passed).toBe(true);
  });
});

describe("release policy and human calibration", () => {
  const evalCase: EvalCase = {
    id: "EVALCASE-0020",
    datasetVersion: "1.0.0",
    category: "requirements",
    input: { grader: "required-fields" },
    expected: { requiredFields: ["prd"] },
    critical: false,
    sourceMode: "simulated"
  };
  const result: EvalResult = {
    caseId: evalCase.id,
    grader: "deterministic:required-fields",
    score: 80,
    passed: true,
    rationale: "Measured partial quality score",
    measuredAt: now,
    durationMs: 2
  };

  it("supports visible configurable thresholds and a distinct missing-approval state", () => {
    expect(evaluateReleaseGate({
      cases: [evalCase],
      results: [result],
      requiredApprovalPresent: true,
      policy: { threshold: 75 }
    }).releaseAllowed).toBe(true);
    expect(evaluateReleaseGate({
      cases: [evalCase],
      results: [result],
      requiredApprovalPresent: true,
      policy: { threshold: 85 }
    }).releaseAllowed).toBe(false);
    expect(evaluateReleaseGate({
      cases: [evalCase],
      results: [{ ...result, score: 100 }],
      requiredApprovalPresent: false,
      policy: { threshold: 85 }
    }).status).toBe("needs_review");
  });

  it("calculates agreement, false-pass, score bias, disagreement and review time", () => {
    const stored = [{
      campaignId: "EVAL-0020",
      campaignVersion: 1,
      datasetId: "DATASET-0020",
      datasetVersion: "1.0.0",
      case: evalCase,
      result,
      graderKind: "semantic" as const,
      executionMode: "mocked-judge" as const
    }];
    const reviews = [
      createHumanReview({
        id: "APR-0200",
        caseId: evalCase.id,
        reviewer: "reviewer-one",
        score: 60,
        passed: false,
        ambiguous: false,
        rationale: "The response misses an important requirement.",
        reviewTimeMs: 1000,
        reviewedAt: now
      }),
      createHumanReview({
        id: "APR-0201",
        caseId: evalCase.id,
        reviewer: "reviewer-two",
        score: 70,
        passed: true,
        ambiguous: true,
        rationale: "The requirement interpretation is ambiguous.",
        reviewTimeMs: 3000,
        reviewedAt: now
      })
    ];
    const calibration = calibrateJudge(stored, reviews);
    expect(calibration.evaluatedCases).toBe(1);
    expect(calibration.reviewerDisagreementRate).toBe(100);
    expect(calibration.averageReviewTimeMs).toBe(2000);
    expect(calibration.meanScoreBias).toBe(15);
  });
});

describe("incident feedback loop", () => {
  it("creates a versioned critical regression case and a linked stable lineage edge", () => {
    const incident: Incident = {
      id: "INC-0002",
      featureId: "FEAT-0001",
      title: "Returning shopper checkout retries fail",
      severity: "SEV-2",
      status: "mitigated",
      detectedAt: now,
      rootCause: "Retry state was not retained after a timeout",
      sourceMode: "simulated"
    };
    const converted = convertIncidentToRegressionCase({
      incident,
      datasetVersion: "1.1.0",
      createdAt: now
    });
    expect(converted.incident.regressionCaseId).toBe(converted.evalCase.id);
    expect(converted.evalCase.category).toBe("regression");
    expect(converted.evalCase.critical).toBe(true);
    expect(converted.lineage.sourceId).toBe("INC-0002");
    expect(converted.lineage.targetId).toBe(converted.evalCase.id);
    expect(converted.lineage.relationship).toBe("creates_regression_case");
  });

  it("versions datasets deterministically and changes checksums when cases change", () => {
    const caseA: EvalCase = {
      id: "EVALCASE-0030",
      datasetVersion: "1.0.0",
      category: "build",
      input: { grader: "boolean-check" },
      expected: { pass: true },
      critical: true,
      sourceMode: "simulated"
    };
    const first = createVersionedDataset({ id: "DATASET-0030", version: "1.0.0", cases: [caseA], createdAt: now });
    const repeat = createVersionedDataset({ id: "DATASET-0030", version: "1.0.0", cases: [caseA], createdAt: now });
    const changed = createVersionedDataset({
      id: "DATASET-0030",
      version: "1.0.0",
      cases: [{ ...caseA, expected: { pass: false } }],
      createdAt: now
    });
    expect(first.checksum).toBe(repeat.checksum);
    expect(changed.checksum).not.toBe(first.checksum);
  });
});
