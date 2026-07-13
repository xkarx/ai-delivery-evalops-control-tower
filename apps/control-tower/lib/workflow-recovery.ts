import type { WorkflowAction } from "@dailycart/schemas";

const providerPhases = new Set(["waiting_vercel", "preview_evaluating", "correcting_preview", "building_preview"]);

export function shouldRecoverWorkflowAction(action: WorkflowAction | undefined, now = Date.now()): boolean {
  if (!action) return false;
  const heartbeatAge = now - Date.parse(action.heartbeatAt);
  if (!Number.isFinite(heartbeatAge)) return false;
  if (action.status === "queued") return heartbeatAge > 12_000;
  if (action.status !== "running") return false;
  return heartbeatAge > (providerPhases.has(action.phase) ? 360_000 : 90_000);
}
