import type { IntegrationHealth } from "@dailycart/schemas";
import { BaseConnector } from "../base";
import { ConnectorError } from "../errors";
import { jsonHeaders, requestJson } from "../http";
import { createCodeHostAdapter } from "./github";
import type {
  AdapterRuntime,
  CodeHostAdapter,
  ConfigurationStatus,
  DeliveryTicketStatus,
  IssueTrackerAdapter,
  TicketInput,
  TicketRecord
} from "../types";

function asWorkflowStatus(state: string | undefined, name?: string): DeliveryTicketStatus {
  if (name?.toLowerCase().includes("block")) return "blocked";
  if (state === "completed") return "done";
  if (state === "canceled") return "blocked";
  if (state === "started") return "in_progress";
  return "todo";
}

function asOpenClosed(status: DeliveryTicketStatus | "open" | "closed" | undefined): "open" | "closed" {
  return status === "done" || status === "blocked" || status === "closed" ? "closed" : "open";
}

function metadataFor(input: TicketInput) {
  return {
    featureId: input.featureId,
    ticketId: input.ticketId,
    prdId: input.prdId,
    evidenceIds: input.evidenceIds,
    owner: input.owner,
    dependsOn: input.dependsOn,
    skillId: input.skillId,
    contextPackId: input.contextPackId,
    featureBatchId: input.featureBatchId
  };
}

export class MockIssueTrackerAdapter extends BaseConnector implements IssueTrackerAdapter {
  readonly kind = "issue-tracker" as const;
  readonly provider = "linear" as const;
  protected readonly requiredEnvironment: string[] = [];
  protected readonly capabilities = ["tickets", "dependencies", "status-sync", "deep-links"];
  private readonly tickets = new Map<string, TicketRecord>();

  constructor(runtime: AdapterRuntime = {}) {
    super("mock", runtime);
  }

  externalUrl(resource = ""): string {
    return `https://linear.app/dailycart${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.healthy("Mock issue tracker is ready.", this.externalUrl());
  }

  async createTicket(input: TicketInput): Promise<TicketRecord> {
    const sequence = this.tickets.size + 1;
    const externalId = `mock-linear-${sequence}`;
    const record: TicketRecord = {
      provider: "linear",
      externalId,
      identifier: `DC-${sequence}`,
      title: input.title,
      state: asOpenClosed(input.workflowStatus ?? "todo"),
      projectId: input.projectId,
      url: this.externalUrl(`issue/DC-${sequence}`),
      sourceMode: "mocked",
      workflowStatus: input.workflowStatus ?? "todo",
      metadata: metadataFor(input)
    };
    this.tickets.set(externalId, record);
    return record;
  }

  async getTicket(externalId: string): Promise<TicketRecord | undefined> {
    return this.tickets.get(externalId);
  }

  async updateTicketState(externalId: string, state: "open" | "closed" | DeliveryTicketStatus): Promise<TicketRecord> {
    const current = this.tickets.get(externalId);
    if (!current) {
      throw new ConnectorError({ provider: this.provider, code: "NOT_FOUND", message: `Ticket ${externalId} was not found.` });
    }
    const workflowStatus = state === "open" || state === "closed" ? current.workflowStatus : state;
    const updated = { ...current, state: asOpenClosed(state), workflowStatus };
    this.tickets.set(externalId, updated);
    return updated;
  }
}

interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state?: { type?: string; name?: string };
  project?: { id: string } | null;
}

interface LinearGraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export class LiveLinearIssueTrackerAdapter extends BaseConnector implements IssueTrackerAdapter {
  readonly kind = "issue-tracker" as const;
  readonly provider = "linear" as const;
  protected readonly requiredEnvironment = ["LINEAR_API_KEY", "LINEAR_TEAM_ID"];
  protected readonly capabilities = ["tickets", "dependencies", "status-sync", "deep-links", "webhooks"];
  private readonly endpoint: string;

  constructor(runtime: AdapterRuntime = {}) {
    super("live", runtime);
    this.endpoint = this.env.LINEAR_API_URL ?? "https://api.linear.app/graphql";
  }

  externalUrl(resource = ""): string {
    return `https://linear.app${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  private async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    this.assertConfigured();
    const response = await requestJson<LinearGraphqlResponse<T>>(this.endpoint, {
      provider: this.provider,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      method: "POST",
      headers: jsonHeaders({ authorization: this.env.LINEAR_API_KEY as string }),
      body: JSON.stringify({ query, variables })
    });
    if (response.errors?.length || !response.data) {
      throw new ConnectorError({
        provider: this.provider,
        code: "PROVIDER_ERROR",
        message: response.errors?.map((error) => error.message).join("; ") ?? "Linear returned no data."
      });
    }
    return response.data;
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.safeHealth(async () => {
      const data = await this.graphql<{ viewer: { name: string } }>("query ConnectorHealth { viewer { id name } }");
      return `Authenticated as ${data.viewer.name}.`;
    }, this.externalUrl());
  }

  private record(issue: LinearIssueNode, metadata?: TicketRecord["metadata"]): TicketRecord {
    const closedTypes = new Set(["completed", "canceled"]);
    const workflowStatus = asWorkflowStatus(issue.state?.type, issue.state?.name);
    return {
      provider: "linear",
      externalId: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      state: closedTypes.has(issue.state?.type ?? "") ? "closed" : "open",
      projectId: issue.project?.id,
      url: issue.url,
      sourceMode: "live",
      workflowStatus,
      metadata
    };
  }

  private async workflowStateId(status: DeliveryTicketStatus): Promise<string | undefined> {
    const states = await this.graphql<{ workflowStates: { nodes: Array<{ id: string; type: string; name?: string }> } }>(
      "query TeamStates($teamId: ID!) { workflowStates(filter: { team: { id: { eq: $teamId } } }) { nodes { id type name } } }",
      { teamId: this.env.LINEAR_TEAM_ID }
    );
    const nodes = states.workflowStates.nodes;
    const byName = status === "blocked"
      ? nodes.find((candidate) => candidate.name?.toLowerCase().includes("block"))
      : status === "in_review"
        ? nodes.find((candidate) => candidate.name?.toLowerCase().includes("review"))
        : undefined;
    if (byName) return byName.id;
    const desiredTypes: Record<DeliveryTicketStatus, string[]> = {
      todo: ["backlog", "unstarted"],
      in_progress: ["started"],
      in_review: ["started"],
      done: ["completed"],
      blocked: ["canceled", "started"]
    };
    return nodes.find((candidate) => desiredTypes[status].includes(candidate.type))?.id;
  }

  async createTicket(input: TicketInput): Promise<TicketRecord> {
    const description = [
      input.description,
      input.featureId ? `Feature: ${input.featureId}` : undefined,
      input.ticketId ? `Control tower ticket: ${input.ticketId}` : undefined,
      input.prdId ? `PRD: ${input.prdId}` : undefined,
      input.evidenceIds?.length ? `Evidence: ${input.evidenceIds.join(", ")}` : undefined,
      input.owner ? `Owner: ${input.owner}` : undefined,
      input.dependsOn?.length ? `Depends on: ${input.dependsOn.join(", ")}` : undefined,
      input.skillId ? `Skill: ${input.skillId}` : undefined,
      input.contextPackId ? `Context pack: ${input.contextPackId}` : undefined,
      input.featureBatchId ? `Feature batch: ${input.featureBatchId}` : undefined,
      input.workflowStatus ? `Delivery status: ${input.workflowStatus}` : undefined
    ].filter(Boolean).join("\n\n");
    const stateId = input.workflowStatus ? await this.workflowStateId(input.workflowStatus) : undefined;
    const data = await this.graphql<{ issueCreate: { success: boolean; issue?: LinearIssueNode } }>(
      "mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title url state { type name } project { id } } } }",
      { input: { teamId: this.env.LINEAR_TEAM_ID, title: input.title, description, projectId: input.projectId, parentId: input.parentId, stateId } }
    );
    if (!data.issueCreate.success || !data.issueCreate.issue) {
      throw new ConnectorError({ provider: this.provider, code: "PROVIDER_ERROR", message: "Linear did not create the ticket." });
    }
    return this.record(data.issueCreate.issue, metadataFor(input));
  }

  async getTicket(externalId: string): Promise<TicketRecord | undefined> {
    try {
      const data = await this.graphql<{ issue: LinearIssueNode | null }>(
        "query GetIssue($id: String!) { issue(id: $id) { id identifier title url state { type name } project { id } } }",
        { id: externalId }
      );
      return data.issue ? this.record(data.issue) : undefined;
    } catch (error) {
      if (error instanceof ConnectorError && error.code === "NOT_FOUND") return undefined;
      throw error;
    }
  }

  async updateTicketState(externalId: string, state: "open" | "closed" | DeliveryTicketStatus): Promise<TicketRecord> {
    const workflowStatus = state === "open" || state === "closed" ? undefined : state;
    const target = await this.workflowStateId(workflowStatus ?? (state === "closed" ? "done" : "in_progress"));
    if (!target) {
      throw new ConnectorError({ provider: this.provider, code: "PROVIDER_ERROR", message: `No Linear workflow state can represent ${state}.` });
    }
    const data = await this.graphql<{ issueUpdate: { success: boolean; issue?: LinearIssueNode } }>(
      "mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier title url state { type name } project { id } } } }",
      { id: externalId, input: { stateId: target } }
    );
    if (!data.issueUpdate.success || !data.issueUpdate.issue) {
      throw new ConnectorError({ provider: this.provider, code: "PROVIDER_ERROR", message: "Linear did not update the ticket." });
    }
    return this.record(data.issueUpdate.issue);
  }
}

export class GitHubIssueTrackerAdapter implements IssueTrackerAdapter {
  readonly kind = "issue-tracker" as const;
  readonly provider = "github" as const;
  readonly mode;
  private readonly tickets = new Map<string, TicketRecord>();

  constructor(private readonly codeHost: CodeHostAdapter) {
    this.mode = codeHost.mode;
  }

  configurationStatus(): ConfigurationStatus {
    return this.codeHost.configurationStatus();
  }

  healthCheck(): Promise<IntegrationHealth> {
    return this.codeHost.healthCheck();
  }

  externalUrl(resource?: string): string | undefined {
    return this.codeHost.externalUrl(resource);
  }

  async createTicket(input: TicketInput): Promise<TicketRecord> {
    const issue = await this.codeHost.createIssue(input);
    const record: TicketRecord = { ...issue, projectId: input.projectId, workflowStatus: input.workflowStatus ?? "todo", metadata: metadataFor(input) };
    this.tickets.set(record.externalId, record);
    return record;
  }

  async getTicket(externalId: string): Promise<TicketRecord | undefined> {
    return this.tickets.get(externalId);
  }

  async updateTicketState(externalId: string, state: "open" | "closed" | DeliveryTicketStatus): Promise<TicketRecord> {
    const current = this.tickets.get(externalId);
    if (!current) {
      throw new ConnectorError({ provider: this.provider, code: "NOT_FOUND", message: `GitHub issue ${externalId} is not in the adapter cache.` });
    }
    if (this.mode === "live") {
      throw new ConnectorError({
        provider: this.provider,
        code: "UNSUPPORTED",
        message: "Closing GitHub Issues is not enabled by this minimal fallback scaffold; update it in GitHub using the external URL."
      });
    }
    const workflowStatus = state === "open" || state === "closed" ? current.workflowStatus : state;
    const updated = { ...current, state: asOpenClosed(state), workflowStatus };
    this.tickets.set(externalId, updated);
    return updated;
  }
}

export function createIssueTrackerAdapter(runtime: AdapterRuntime = {}, codeHost?: CodeHostAdapter): IssueTrackerAdapter {
  const env = runtime.env ?? process.env;
  if (env.INTEGRATION_MODE !== "live") return new MockIssueTrackerAdapter(runtime);
  if (env.LINEAR_API_KEY?.trim() && env.LINEAR_TEAM_ID?.trim()) return new LiveLinearIssueTrackerAdapter(runtime);
  return new GitHubIssueTrackerAdapter(codeHost ?? createCodeHostAdapter(runtime));
}
