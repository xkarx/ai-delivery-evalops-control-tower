import { createCodeHostAdapter } from "./providers/github";
import { createIssueTrackerAdapter } from "./providers/issue-tracker";
import { createChatAdapter } from "./providers/slack";
import { createTraceAdapter } from "./providers/langfuse";
import { createProductAnalyticsAdapter } from "./providers/posthog";
import { createDatabaseAdapter } from "./providers/supabase";
import { createDeploymentAdapter } from "./providers/vercel";
import { createWorkflowAdapter } from "./providers/inngest";
import type {
  AdapterRuntime,
  ChatAdapter,
  CodeHostAdapter,
  DatabaseAdapter,
  DeploymentAdapter,
  IssueTrackerAdapter,
  ProductAnalyticsAdapter,
  TraceAdapter,
  WorkflowAdapter
} from "./types";

export interface ConnectorSuite {
  codeHost: CodeHostAdapter;
  issueTracker: IssueTrackerAdapter;
  chat: ChatAdapter;
  trace: TraceAdapter;
  productAnalytics: ProductAnalyticsAdapter;
  database: DatabaseAdapter;
  deployment: DeploymentAdapter;
  workflow: WorkflowAdapter;
}

export function createConnectorSuite(runtime: AdapterRuntime = {}): ConnectorSuite {
  const codeHost = createCodeHostAdapter(runtime);
  return {
    codeHost,
    issueTracker: createIssueTrackerAdapter(runtime, codeHost),
    chat: createChatAdapter(runtime),
    trace: createTraceAdapter(runtime),
    productAnalytics: createProductAnalyticsAdapter(runtime),
    database: createDatabaseAdapter(runtime),
    deployment: createDeploymentAdapter(runtime),
    workflow: createWorkflowAdapter(runtime)
  };
}
