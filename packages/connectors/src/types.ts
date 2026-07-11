import type {
  Deployment,
  IntegrationHealth,
  LineageEdge,
  ProductEvent,
  SourceMode
} from "@dailycart/schemas";

export type ConnectorMode = "mock" | "live";
export type ConnectorProvider = IntegrationHealth["provider"];
export type Environment = Readonly<Record<string, string | undefined>>;
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface AdapterRuntime {
  env?: Environment;
  fetch?: FetchLike;
  now?: () => Date;
  timeoutMs?: number;
}

export interface ConfigurationStatus {
  provider: ConnectorProvider;
  mode: ConnectorMode;
  configured: boolean;
  writeEnabled: boolean;
  requiredEnvironment: string[];
  missingEnvironment: string[];
  message: string;
}

export interface ExternalReference {
  provider: string;
  externalId: string;
  url: string;
  sourceMode: Extract<SourceMode, "mocked" | "live">;
}

export interface BaseAdapter {
  readonly kind: string;
  readonly provider: ConnectorProvider;
  readonly mode: ConnectorMode;
  configurationStatus(): ConfigurationStatus;
  healthCheck(): Promise<IntegrationHealth>;
  externalUrl(resource?: string): string | undefined;
}

export interface RepositorySnapshot {
  fullName: string;
  defaultBranch: string;
  private: boolean;
  url: string;
  openIssues: number;
  sourceMode: Extract<SourceMode, "mocked" | "live">;
}

export interface IssueInput {
  title: string;
  description: string;
  labels?: string[];
  assigneeIds?: string[];
  featureId?: string;
  ticketId?: string;
  /** Stable delivery metadata retained in provider descriptions/records. */
  prdId?: string;
  evidenceIds?: string[];
  owner?: string;
}

export interface IssueRecord extends ExternalReference {
  identifier: string;
  title: string;
  state: "open" | "closed";
}

export interface BranchInput {
  name: string;
  from?: string;
}

export interface BranchRecord extends ExternalReference {
  name: string;
  sha: string;
}

export interface PullRequestInput {
  title: string;
  body: string;
  head: string;
  base?: string;
  draft?: boolean;
  featureId?: string;
  ticketIds?: string[];
}

export interface PullRequestRecord extends ExternalReference {
  number: number;
  title: string;
  head: string;
  base: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
}

export interface CheckRecord {
  id: string;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "cancelled" | "skipped" | null;
  url?: string;
}

export interface ReleaseInput {
  tag: string;
  name: string;
  notes: string;
  targetCommitish?: string;
  prerelease?: boolean;
}

export interface CodeHostAdapter extends BaseAdapter {
  readonly kind: "code-host";
  inspectRepository(): Promise<RepositorySnapshot>;
  createIssue(input: IssueInput): Promise<IssueRecord>;
  createBranch(input: BranchInput): Promise<BranchRecord>;
  commitFile(input: FileCommitInput): Promise<FileCommitRecord>;
  openPullRequest(input: PullRequestInput): Promise<PullRequestRecord>;
  listChecks(ref: string): Promise<CheckRecord[]>;
  createRelease(input: ReleaseInput): Promise<ExternalReference>;
}

export interface FileCommitInput {
  path: string;
  content: string;
  message: string;
  branch: string;
  sha?: string;
}

export interface FileCommitRecord extends ExternalReference {
  path: string;
  commitSha: string;
  branch: string;
}

export interface TicketInput extends IssueInput {
  projectId?: string;
  parentId?: string;
  dependsOn?: string[];
  workflowStatus?: DeliveryTicketStatus;
}

export type DeliveryTicketStatus = "todo" | "in_progress" | "in_review" | "done" | "blocked";

export interface TicketMetadata {
  featureId?: string;
  ticketId?: string;
  prdId?: string;
  evidenceIds?: string[];
  owner?: string;
  dependsOn?: string[];
}

export interface TicketRecord extends IssueRecord {
  projectId?: string;
  workflowStatus?: DeliveryTicketStatus;
  metadata?: TicketMetadata;
}

export interface IssueTrackerAdapter extends BaseAdapter {
  readonly kind: "issue-tracker";
  createTicket(input: TicketInput): Promise<TicketRecord>;
  getTicket(externalId: string): Promise<TicketRecord | undefined>;
  updateTicketState(externalId: string, state: "open" | "closed" | DeliveryTicketStatus): Promise<TicketRecord>;
}

export interface ChatMessageInput {
  text: string;
  channel?: string;
  threadId?: string;
  blocks?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface ChatMessageRecord extends ExternalReference {
  channel: string;
  threadId: string;
  text: string;
}

export interface ApprovalMessageInput {
  approvalId: string;
  title: string;
  detail: string;
  approveLabel?: string;
  rejectLabel?: string;
  channel?: string;
}

export interface ChatAdapter extends BaseAdapter {
  readonly kind: "chat";
  postMessage(input: ChatMessageInput): Promise<ChatMessageRecord>;
  requestApproval(input: ApprovalMessageInput): Promise<ChatMessageRecord>;
}

export interface TraceInput {
  id?: string;
  name: string;
  userId?: string;
  sessionId?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface TraceRecord extends ExternalReference {
  name: string;
  startedAt: string;
  metadata: Record<string, unknown>;
}

export interface TraceScoreInput {
  traceId: string;
  name: string;
  value: number | boolean | string;
  comment?: string;
}

export interface TraceAdapter extends BaseAdapter {
  readonly kind: "trace";
  startTrace(input: TraceInput): Promise<TraceRecord>;
  addScore(input: TraceScoreInput): Promise<ExternalReference>;
  getTrace(traceId: string): Promise<TraceRecord | undefined>;
}

export interface FunnelStage {
  event: ProductEvent["event"];
  label?: string;
}

export interface FunnelResult {
  stages: Array<{ event: ProductEvent["event"]; label: string; count: number; conversionFromPrevious: number }>;
  uniqueCustomers: number;
  sourceMode: Extract<SourceMode, "mocked" | "live">;
  externalUrl?: string;
}

export interface ProductAnalyticsAdapter extends BaseAdapter {
  readonly kind: "product-analytics";
  capture(event: ProductEvent): Promise<ExternalReference>;
  captureBatch(events: ProductEvent[]): Promise<ExternalReference[]>;
  queryFunnel(stages: FunnelStage[], from?: string, to?: string): Promise<FunnelResult>;
}

export interface DatabaseAdapter extends BaseAdapter {
  readonly kind: "database";
  upsert<T extends Record<string, unknown>>(table: string, row: T, conflictColumn?: string): Promise<T>;
  select<T extends Record<string, unknown>>(table: string, filters?: Record<string, string | number | boolean>): Promise<T[]>;
  appendLineage(edge: LineageEdge): Promise<LineageEdge>;
}

export interface DeploymentInput {
  id?: string;
  featureId: string;
  environment: Deployment["environment"];
  commitSha: string;
  repository?: string;
  ref?: string;
}

export interface DeploymentRecord extends ExternalReference {
  deployment: Deployment;
}

export interface TeardownRequest {
  confirmation: "teardown-sample-product" | "teardown-deployment";
  reason: string;
}

export interface DeploymentAdapter extends BaseAdapter {
  readonly kind: "deployment";
  deploy(input: DeploymentInput): Promise<DeploymentRecord>;
  getDeployment(externalId: string): Promise<DeploymentRecord | undefined>;
  teardown(externalId: string, request: TeardownRequest): Promise<void>;
}

export interface WorkflowEventInput {
  id?: string;
  name: string;
  data: Record<string, unknown>;
  user?: { externalId: string; email?: string };
}

export interface WorkflowRunRecord extends ExternalReference {
  eventName: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
}

export interface WorkflowAdapter extends BaseAdapter {
  readonly kind: "workflow";
  emit(input: WorkflowEventInput): Promise<WorkflowRunRecord>;
  getRun(externalId: string): Promise<WorkflowRunRecord | undefined>;
  cancel(externalId: string): Promise<WorkflowRunRecord>;
}

export type TrafficScenario = "baseline" | "feature-exposure" | "checkout-failure" | "mixed";
export type TrafficDevice = "desktop" | "mobile" | "tablet";
export type TrafficGeography = "na" | "emea" | "apac" | "latam";

export interface TrafficCostControls {
  maxEstimatedUsd: number;
  maxRuntimeSeconds: number;
  costPerThousandEventsUsd: number;
  maxEvents: number;
}

export interface TrafficConfig {
  userCount: number;
  spawnRatePerSecond: number;
  durationSeconds: number;
  seed: number;
  scenario: TrafficScenario;
  customerPoolSize?: number;
  returningCustomerRate?: number;
  featureExposureRate?: number;
  failureRate?: number;
  devices?: Partial<Record<TrafficDevice, number>>;
  geographies?: Partial<Record<TrafficGeography, number>>;
  behaviorWeights?: Partial<Record<"search" | "cart" | "checkout", number>>;
  costControls: TrafficCostControls;
}

export interface TrafficRunResult {
  runId: string;
  requestedConfig: TrafficConfig;
  effectiveUserCount: number;
  events: ProductEvent[];
  funnel: Array<{ stage: ProductEvent["event"]; count: number }>;
  customerIds: string[];
  exposureCount: number;
  failureCount: number;
  estimatedCostUsd: number;
  startedAt: string;
  endedAt: string;
  capped: boolean;
  stopReason: "completed" | "cost_cap" | "event_cap" | "runtime_cap" | "stopped";
  sourceMode: Extract<SourceMode, "simulated" | "live">;
}

export interface SampleProductStatus {
  running: boolean;
  activeTrafficRunId?: string;
  productUrl: string;
  repositoryUrl?: string;
  lastRun?: TrafficRunResult;
  estimatedHourlyCostUsd: number;
  sourceMode: Extract<SourceMode, "simulated" | "live">;
}

export interface SampleProductAdapter extends BaseAdapter {
  readonly kind: "sample-product";
  status(): Promise<SampleProductStatus>;
  startTraffic(config: TrafficConfig): Promise<TrafficRunResult>;
  stopTraffic(): Promise<TrafficRunResult | undefined>;
  teardown(request: TeardownRequest): Promise<void>;
}
