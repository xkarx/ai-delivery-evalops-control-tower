import { describe, expect, it } from "vitest";

import {
  actionIsBusyAtPhase,
  authoritativeWorkflowPhase,
  isHumanGatePhase,
  phaseForNewCommand,
  shouldReconcileHumanGateAction,
  shouldReuseBusyAction,
} from "../apps/control-tower/lib/workflow-human-gates";

describe("workflow human gates", () => {
  it("recognizes the two operator decision phases", () => {
    expect(isHumanGatePhase("awaiting_feature_approval")).toBe(true);
    expect(isHumanGatePhase("awaiting_release_approval")).toBe(true);
    expect(isHumanGatePhase("preview_evaluating")).toBe(false);
  });

  it("reconciles stale queued or running actions at a persisted human gate", () => {
    expect(
      shouldReconcileHumanGateAction(
        { status: "running", phase: "awaiting_feature_approval" },
        "awaiting_feature_approval",
      ),
    ).toBe(true);
    expect(
      shouldReconcileHumanGateAction(
        { status: "waiting_human", phase: "awaiting_feature_approval" },
        "awaiting_feature_approval",
      ),
    ).toBe(false);
    expect(
      shouldReconcileHumanGateAction(
        { status: "running", phase: "preview_evaluating" },
        "awaiting_feature_approval",
      ),
    ).toBe(false);
  });

  it("does not treat a reconciled human gate as busy", () => {
    expect(
      actionIsBusyAtPhase(
        { status: "running", phase: "awaiting_feature_approval" },
        "awaiting_feature_approval",
      ),
    ).toBe(false);
    expect(
      actionIsBusyAtPhase(
        { status: "running", phase: "preview_evaluating" },
        "preview_evaluating",
      ),
    ).toBe(true);
    expect(
      actionIsBusyAtPhase(
        { status: "queued", phase: "queued" },
        "awaiting_feature_approval",
      ),
    ).toBe(true);
  });

  it("validates human decisions against the current gate instead of the action's stale parent phase", () => {
    expect(
      authoritativeWorkflowPhase(
        {
          status: "waiting_human",
          phase: "awaiting_release_approval",
          parentPhase: "awaiting_feature_approval",
        },
        "awaiting_release_approval",
      ),
    ).toBe("awaiting_release_approval");

    expect(
      authoritativeWorkflowPhase(
        { status: "failed", phase: "failed", parentPhase: "preview_evaluating" },
        "failed",
      ),
    ).toBe("preview_evaluating");
  });

  it("does not reuse a delayed action for a different command", () => {
    const delayedRelease = { status: "running" as const, command: "approve_release" as const };
    expect(shouldReuseBusyAction(delayedRelease, "approve_release")).toBe(true);
    expect(shouldReuseBusyAction(delayedRelease, "declare_incident")).toBe(false);
  });

  it("uses the released workflow phase for a post-release incident", () => {
    expect(
      phaseForNewCommand(
        { status: "running", phase: "starting", parentPhase: "awaiting_release_approval" },
        "released",
        "declare_incident",
      ),
    ).toBe("released");
  });
});
