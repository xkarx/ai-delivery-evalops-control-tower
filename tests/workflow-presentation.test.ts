import { describe, expect, it } from "vitest";
import { executionStepIndex, journey } from "../apps/control-tower/lib/workflow-presentation";

describe("workflow presentation journey", () => {
  it("keeps the causal walkthrough in the required order", () => {
    expect(journey.map((step) => step.id)).toEqual([
      "company_context", "live_agent_analysis", "ranked_opportunities", "feature_approval", "delivery_planning", "builds", "eval_campaign", "release_approval", "deployment", "delivery_report", "product_outcomes", "incident_learning", "lineage"
    ]);
  });

  it("separates execution progress from sequential presentation", () => {
    expect(executionStepIndex("agent_research")).toBe(1);
    expect(executionStepIndex("awaiting_feature_approval")).toBe(3);
    expect(executionStepIndex("preview_evaluating")).toBe(6);
    expect(executionStepIndex("awaiting_release_approval")).toBe(7);
    expect(executionStepIndex("released")).toBe(12);
  });
});
