import type { WorkflowAction } from "@dailycart/schemas";

const providerPhases = new Set(["waiting_vercel", "preview_evaluating", "correcting_preview", "building_preview"]);

export function shouldRecoverWorkflowAction(action: WorkflowAction | undefined, now = Date.now()): boolean {
  if (!action) return false;
  // A durable execution lease is stronger than the heartbeat age. A browser
  // poll must never start a second worker while Inngest (or another worker)
  // still owns an unexpired lease.
  if (action.executionLease && Date.parse(action.executionLease.expiresAt) > now) return false;
  const heartbeatAge = now - Date.parse(action.heartbeatAt);
  if (!Number.isFinite(heartbeatAge)) return false;
  if (action.status === "queued") return heartbeatAge > 12_000;
  if (action.status !== "running") return false;
  return heartbeatAge > (providerPhases.has(action.phase) ? 360_000 : 90_000);
}
