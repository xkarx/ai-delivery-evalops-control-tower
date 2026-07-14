import type { WorkflowAction } from "@dailycart/schemas";

export const humanGatePhases = ["awaiting_feature_approval", "awaiting_release_approval"] as const;
type ActionGateState = Pick<WorkflowAction, "status" | "phase">;
type ActionPhaseState = Pick<WorkflowAction, "status" | "phase" | "parentPhase">;
type ActionCommandState = Pick<WorkflowAction, "status" | "command">;

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

export function shouldReuseBusyAction(action: ActionCommandState | undefined, command: string): boolean {
  return Boolean(action && action.command === command && ["queued", "running"].includes(action.status));
}

export function phaseForNewCommand(action: ActionPhaseState | undefined, workflowPhase: string | undefined, command: string): string | undefined {
  if (command === "declare_incident" && ["released", "product_outcomes"].includes(workflowPhase ?? "")) return workflowPhase;
  return authoritativeWorkflowPhase(action, workflowPhase);
}
