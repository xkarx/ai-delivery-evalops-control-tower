import type { AgentHandoffMessage, AgentHandoffThreadResult } from "@dailycart/connectors";
import { appendArtifact } from "./durable-artifacts";

export interface WorkflowHandoffInput {
  workflowId: string;
  featureId: string;
  featureTitle: string;
  ticketIds: string[];
  engineeringRunIds: string[];
  blockedCampaignId: string;
  passedCampaignId: string;
  releaseApprovalId: string;
  evidenceIds?: string[];
}

export function buildWorkflowHandoffs(input: WorkflowHandoffInput): AgentHandoffMessage[] {
  const evidenceIds = input.evidenceIds?.length ? input.evidenceIds : ["EVD-0003", "EVD-0005", "EVD-0006"];
  const sourceMode = process.env.INTEGRATION_MODE === "live" ? "live" : "mocked";
  return [
    {
      id: `${input.workflowId}:pm`, workflowId: input.workflowId, persona: "PM agent", role: "Product manager",
      task: `Cluster customer evidence and recommend ${input.featureTitle}.`, evidenceIds,
      result: `Selected ${input.featureId} from converging customer and product signals and created a PM-owned implementation brief.`, nextAction: "Send the brief to UX and Engineering Feasibility for review.", status: "succeeded", sourceMode
    },
    {
      id: `${input.workflowId}:ux`, workflowId: input.workflowId, persona: "UX Agent", role: "UX and accessibility review",
      task: `Review the customer journey and acceptance criteria for ${input.featureId}.`, evidenceIds,
      result: "Checked clarity, keyboard access, focus behavior, and recovery states.", nextAction: "Return findings to PM for the next brief revision.", status: "succeeded", sourceMode
    },
    {
      id: `${input.workflowId}:feasibility`, workflowId: input.workflowId, persona: "Engineering Feasibility Agent", role: "Technical feasibility review",
      task: `Inspect the affected product surface, telemetry, and test strategy for ${input.featureId}.`, evidenceIds: [input.featureId],
      result: "Confirmed bounded scope, implementation surfaces, and preview requirements.", nextAction: "PM incorporates feedback before feature approval.", status: "succeeded", sourceMode
    },
    {
      id: `${input.workflowId}:tpm`, workflowId: input.workflowId, persona: "TPM agent", role: "Technical program manager",
      task: `Decompose ${input.featureId} into independently deliverable work.`, evidenceIds: [input.featureId],
      result: `Planned ${input.ticketIds.length} linked delivery tickets.`, nextAction: "Start parallel engineering workstreams.", status: "succeeded", sourceMode
    },
    {
      id: `${input.workflowId}:engineering`, workflowId: input.workflowId, persona: "Engineering agents", role: "Parallel implementation",
      task: `Implement the API and customer-experience workstreams for ${input.featureId}.`, evidenceIds: input.ticketIds,
      result: `Completed ${input.engineeringRunIds.length} independent engineering runs.`, nextAction: "Submit the correction candidate to EvalOps.", status: "succeeded", sourceMode
    },
    {
      id: `${input.workflowId}:eval`, workflowId: input.workflowId, persona: "Eval agent", role: "Evaluation and release gate",
      task: "Run deterministic and semantic checks against the delivery candidate.", evidenceIds: [input.blockedCampaignId, input.passedCampaignId],
      result: `${input.blockedCampaignId} blocked on a critical regression; ${input.passedCampaignId} passed after correction.`, nextAction: `Request human approval ${input.releaseApprovalId}.`, status: "waiting_approval", sourceMode
    },
    {
      id: `${input.workflowId}:release`, workflowId: input.workflowId, persona: "Release agent", role: "Release manager",
      task: "Prepare production release while preserving the human approval boundary.", evidenceIds: [input.passedCampaignId, input.releaseApprovalId],
      result: "Release is eligible but has not been deployed without approval.", nextAction: `Await reviewer decision on ${input.releaseApprovalId}.`, status: "waiting_approval", sourceMode
    }
  ];
}

export async function persistHandoffThread(_root: string, result: AgentHandoffThreadResult): Promise<void> {
  await appendArtifact("agentHandoffs", { ...result, recordedAt: new Date().toISOString() }, 100);
}
