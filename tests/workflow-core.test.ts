import { describe, expect, it } from "vitest";
import { LineageGraph, buildLifecycleLineage, stableId } from "../packages/lineage/src/index";
import { DeliveryWorkflow } from "../packages/workflow/src/index";

const now = "2026-01-15T12:00:00.000Z";
const clock = () => now;

describe("delivery workflow human gates", () => {
  it("pauses, survives serialization, resumes only with independent human approval, and recovers from a blocked eval", () => {
    const workflow = DeliveryWorkflow.start(
      { id: "RUN-0100", featureId: "FEAT-0001", actor: "pm-agent" },
      clock
    );

    const awaitingFeature = workflow.requestFeatureApproval("APR-0001", "pm-agent");
    expect(awaitingFeature.phase).toBe("awaiting_feature_approval");
    expect(workflow.isPaused).toBe(true);

    const resumed = DeliveryWorkflow.hydrate(workflow.serialize(), clock);
    expect(() => resumed.resumeWithHumanDecision({
      approvalId: "APR-0001",
      status: "approved",
      reviewer: "pm-agent",
      rationale: "I approve my own request",
      decisionId: "DEC-0001"
    })).toThrow(/cannot approve their own/i);

    expect(resumed.resumeWithHumanDecision({
      approvalId: "APR-0001",
      status: "approved",
      reviewer: "product-lead",
      rationale: "The cited evidence supports investment.",
      decisionId: "DEC-0001"
    }).phase).toBe("planning");

    resumed.completePlanning(["TKT-0001", "TKT-0002"], "tpm-agent");
    resumed.completeDelivery(["RUN-0003", "RUN-0004"], "engineering-lead");
    expect(resumed.snapshot().phase).toBe("evaluation");

    const blocked = resumed.recordEvalGate({
      campaignId: "EVAL-0001",
      releaseAllowed: false,
      reason: "Critical deterministic regression failed",
      actor: "eval-agent"
    });
    expect(blocked.phase).toBe("blocked");

    resumed.rerunAfterCorrection("engineering-agent", "Corrected the critical regression");
    const awaitingRelease = resumed.recordEvalGate({
      campaignId: "EVAL-0002",
      releaseAllowed: true,
      reason: "Corrected campaign passed",
      actor: "release-agent",
      releaseApprovalId: "APR-0002"
    });
    expect(awaitingRelease.phase).toBe("awaiting_release_approval");
    expect(resumed.isPaused).toBe(true);

    expect(resumed.resumeWithHumanDecision({
      approvalId: "APR-0002",
      status: "approved",
      reviewer: "release-manager",
      rationale: "Verified corrected evals and preview readiness."
    }).phase).toBe("ready_to_release");
    expect(resumed.markReleased("DEP-0001", "release-agent").phase).toBe("released");

    const final = resumed.snapshot();
    expect(final.evalCampaignIds).toEqual(["EVAL-0001", "EVAL-0002"]);
    expect(final.engineeringRunIds).toEqual(["RUN-0003", "RUN-0004"]);
    expect(final.history.map((event) => event.id)).toEqual(
      final.history.map((_, index) => stableId("ACT", index + 1))
    );
  });

  it("does not allow delivery to claim a single workstream", () => {
    const workflow = DeliveryWorkflow.start(
      { id: "RUN-0101", featureId: "FEAT-0001", actor: "pm-agent" },
      clock
    );
    workflow.requestFeatureApproval("APR-0010", "pm-agent");
    workflow.resumeWithHumanDecision({
      approvalId: "APR-0010",
      status: "approved",
      reviewer: "product-lead",
      rationale: "Evidence and scope are sufficient.",
      decisionId: "DEC-0010"
    });
    expect(() => workflow.completePlanning(["TKT-0001"], "tpm-agent")).toThrow(/at least two/i);
  });
});

describe("stable lineage", () => {
  it("preserves a complete evidence-to-regression path with deterministic edge IDs", () => {
    const edges = buildLifecycleLineage({
      evidenceIds: ["EVD-0001", "EVD-0002"],
      featureId: "FEAT-0001",
      decisionId: "DEC-0001",
      prdId: "PRD-0001",
      ticketIds: ["TKT-0001", "TKT-0002"],
      runIds: ["RUN-0003", "RUN-0004"],
      pullRequestIds: ["PR-0001", "PR-0002"],
      evalId: "EVAL-0002",
      deploymentId: "DEP-0001",
      incidentId: "INC-0001",
      regressionCaseId: "EVALCASE-0041"
    }, now);
    const graph = new LineageGraph(edges);

    expect(graph.hasPath("EVD-0001", "EVALCASE-0041")).toBe(true);
    expect(graph.path("EVD-0001", "EVALCASE-0041").map((edge) => edge.relationship)).toEqual([
      "supports",
      "specified_by",
      "decomposed_into",
      "executed_by",
      "evaluated_by",
      "gated",
      "observed_in",
      "creates_regression_case"
    ]);
    expect(edges.map((edge) => edge.id)).toEqual(
      edges.map((_, index) => `LIN-${String(index + 1).padStart(4, "0")}`)
    );
  });
});
