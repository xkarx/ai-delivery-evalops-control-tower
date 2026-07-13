import { workflowPresentationSchema, type WorkflowPresentation, type WorkflowPresentationStep } from "@dailycart/schemas";
import { readArtifact, writeArtifact } from "./durable-artifacts";

export const journey = [
  { id: "company_context", label: "Company context", href: "/company" },
  { id: "live_agent_analysis", label: "Live agent analysis", href: "/runs#agent-activity" },
  { id: "ranked_opportunities", label: "Ranked opportunities", href: "/features" },
  { id: "feature_approval", label: "Feature approval", href: "/reviews#feature-gate" },
  { id: "delivery_planning", label: "Delivery planning", href: "/delivery" },
  { id: "builds", label: "Builds and providers", href: "/delivery#provider-activity" },
  { id: "eval_campaign", label: "Eval campaign", href: "/evals" },
  { id: "release_approval", label: "Release approval", href: "/reviews#release-gate" },
  { id: "deployment", label: "Deployment", href: "/releases" },
  { id: "delivery_report", label: "Delivery report", href: "/runs/summary" },
  { id: "product_outcomes", label: "Product outcomes", href: "/analytics" },
  { id: "incident_learning", label: "Incident learning", href: "/incidents" },
  { id: "lineage", label: "End-to-end lineage", href: "/lineage" }
] as const satisfies ReadonlyArray<{ id: WorkflowPresentationStep; label: string; href: string }>;

type Store = Record<string, WorkflowPresentation>;

export function executionStepIndex(phase: string): number {
  if (["starting", "context", "agent_research"].includes(phase)) return 1;
  if (phase === "awaiting_feature_approval") return 3;
  if (["planning", "provider_sync"].includes(phase)) return 4;
  if (["building_preview", "waiting_vercel", "preview_ready"].includes(phase)) return 5;
  if (["preview_evaluating", "correcting_preview"].includes(phase)) return 6;
  if (phase === "awaiting_release_approval") return 7;
  if (phase === "deploying") return 8;
  if (phase === "released") return 12;
  return 0;
}

export async function getPresentation(sessionId: string, phase: string): Promise<WorkflowPresentation> {
  const store = await readArtifact<Store>("workflowPresentations") ?? {};
  const ceiling = executionStepIndex(phase);
  const existing = store[sessionId];
  const currentIndex = existing ? Math.min(journey.findIndex((step) => step.id === existing.currentStep), ceiling) : 0;
  const safeIndex = Math.max(0, currentIndex);
  const presentation = workflowPresentationSchema.parse({
    sessionId,
    currentStep: journey[safeIndex]!.id,
    completedSteps: (existing?.completedSteps ?? []).filter((step) => journey.findIndex((item) => item.id === step) < safeIndex + 1),
    nextStep: safeIndex < journey.length - 1 ? journey[safeIndex + 1]!.id : undefined,
    autoFollow: existing?.autoFollow ?? true,
    pausedReason: existing?.pausedReason,
    executionAheadBy: Math.max(0, ceiling - safeIndex),
    updatedAt: existing?.updatedAt ?? new Date().toISOString()
  });
  if (!existing) { store[sessionId] = presentation; await writeArtifact("workflowPresentations", store); }
  return presentation;
}

export async function updatePresentation(sessionId: string, phase: string, command: "continue" | "pause" | "resume", reason?: string): Promise<WorkflowPresentation> {
  const store = await readArtifact<Store>("workflowPresentations") ?? {};
  const current = await getPresentation(sessionId, phase);
  const currentIndex = journey.findIndex((step) => step.id === current.currentStep);
  const ceiling = executionStepIndex(phase);
  const nextIndex = command === "continue" ? Math.min(currentIndex + 1, ceiling) : currentIndex;
  const completedSteps = command === "continue"
    ? [...new Set([...current.completedSteps, journey[currentIndex]!.id])]
    : current.completedSteps;
  const next = workflowPresentationSchema.parse({
    ...current,
    currentStep: journey[nextIndex]!.id,
    completedSteps,
    nextStep: nextIndex < journey.length - 1 ? journey[nextIndex + 1]!.id : undefined,
    autoFollow: command === "pause" ? false : command === "resume" ? true : current.autoFollow,
    pausedReason: command === "pause" ? reason ?? "Manual navigation" : command === "resume" ? undefined : current.pausedReason,
    executionAheadBy: Math.max(0, ceiling - nextIndex),
    updatedAt: new Date().toISOString()
  });
  store[sessionId] = next;
  await writeArtifact("workflowPresentations", store);
  return next;
}
