import { describe, expect, it } from "vitest";
import { analyzeProductEvidence, loadCompanyContextPack, runEngineeringFeasibilityReview, runUxReview } from "../packages/agents/src/index";

describe("versioned company context pack", () => {
  it("loads manifest categories and evidence IDs for a workflow", async () => {
    const pack = await loadCompanyContextPack(process.cwd(), { expectedVersion: "1.0.0" });
    expect(pack.version).toBe("1.0.0");
    expect(pack.categories.map((category) => category.id)).toContain("research");
    expect(pack.evidenceIds.length).toBeGreaterThan(30);
    expect(pack.categories.find((category) => category.id === "research")?.evidenceIds.length).toBe(pack.evidenceIds.length);
  });

  it("keeps UX and feasibility reviews as independent AgentRun-compatible records", async () => {
    const pack = await loadCompanyContextPack(process.cwd());
    const analysis = analyzeProductEvidence(pack.evidence, { now: "2026-01-15T12:00:00.000Z" });
    const feature = { ...analysis.opportunities[0]!, status: "approved" as const };
    const ux = runUxReview(feature, analysis.implementationBrief, { now: "2026-01-15T12:00:00.000Z" });
    const feasibility = runEngineeringFeasibilityReview(feature, analysis.implementationBrief, { now: "2026-01-15T12:00:00.000Z" });
    expect(ux.reviewType).toBe("ux");
    expect(feasibility.reviewType).toBe("engineering-feasibility");
    expect(ux.run.agent).toBe("ux");
    expect(feasibility.run.agent).toBe("engineering_feasibility");
    expect(ux.run.featureId).toBe(feature.id);
    expect(feasibility.run.featureId).toBe(feature.id);
  });
});
