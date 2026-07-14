import type { WorkflowAction } from "@dailycart/schemas";

export const humanGatePhases = ["awaiting_feature_approval", "awaiting_release_approval"] as const;
type ActionGateState = Pick<WorkflowAction, "status" | "phase">;
type ActionPhaseState = Pick<WorkflowAction, "status" | "phase" | "parentPhase">;

export function isHumanGatePhase(phase?: string): boolean {
  return Boolean(phase && humanGatePhases.includes(phase as (typeof humanGatePhases)[number]));
}

export function shouldReconcileHumanGateAction(action: ActionGateState | undefined, workflowPhase?: string): action is WorkflowAction {
  return Boolean(
    action
    && isHumanGatePhase(workflowPhase)
    && action.phase === workflowPhase
    && ["queued", "running"].includes(action.status)
  );
}

export function actionIsBusyAtPhase(action: ActionGateState | undefined, phase?: string): boolean {
  if (!action || !["queued", "running"].includes(action.status)) return false;
  return !(isHumanGatePhase(phase) && action.phase === phase);
}

export function authoritativeWorkflowPhase(action: ActionPhaseState | undefined, workflowPhase?: string): string | undefined {
  if (action?.status === "waiting_human" && isHumanGatePhase(action.phase)) return action.phase;
  return action?.parentPhase ?? action?.phase ?? workflowPhase;
}
