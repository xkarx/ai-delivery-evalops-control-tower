import { inngest } from "./client";
import { persistStructuredRecord } from "@/lib/durable-artifacts";

type WorkflowCompletedEvent = {
  workflowId?: string;
  sessionId?: string;
  featureId?: string;
  featureIds?: string[];
  phase?: string;
  proofId?: string;
};

export const recordWorkflowCompletion = inngest.createFunction(
  { id: "record-workflow-completion", retries: 3, triggers: { event: "dailycart/workflow.completed" } },
  async ({ event, step }) => {
    const data = event.data as WorkflowCompletedEvent;
    const eventId = event.id;
    const recordId = data.proofId ?? eventId;

    await step.run("persist-workflow-event", async () => {
      await persistStructuredRecord("inngest_runs", recordId, {
        eventId,
        functionId: "record-workflow-completion",
        status: "running",
        workflowId: data.workflowId,
        sessionId: data.sessionId,
        featureId: data.featureId,
        featureIds: data.featureIds,
        phase: data.phase,
        sourceMode: process.env.INTEGRATION_MODE === "live" ? "live" : "deterministic-fallback",
        startedAt: new Date().toISOString()
      });
      return { eventId, recordId };
    });

    return step.run("complete-workflow-event", async () => {
      const completedAt = new Date().toISOString();
      const output = {
        eventId,
        functionId: "record-workflow-completion",
        status: "completed",
        workflowId: data.workflowId,
        sessionId: data.sessionId,
        featureId: data.featureId,
        featureIds: data.featureIds,
        phase: data.phase,
        sourceMode: process.env.INTEGRATION_MODE === "live" ? "live" : "deterministic-fallback",
        completedAt
      };
      await persistStructuredRecord("inngest_runs", recordId, output);
      return output;
    });
  }
);
