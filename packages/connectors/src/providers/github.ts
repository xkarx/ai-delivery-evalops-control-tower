import { createSign } from "node:crypto";
import type { IntegrationHealth } from "@dailycart/schemas";
import { BaseConnector } from "../base";
import { ConnectorError } from "../errors";
import { jsonHeaders, requestJson } from "../http";
import type {
  AdapterRuntime,
  BranchInput,
  BranchRecord,
  CheckRecord,
  CodeHostAdapter,
  ConfigurationStatus,
  ExternalReference,
  IssueInput,
  IssueRecord,
  PullRequestInput,
  PullRequestRecord,
  ReleaseInput,
  RepositorySnapshot
} from "../types";

const API_VERSION = "2022-11-28";

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function splitRepository(repository: string): [string, string] {
  const parts = repository.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").split("/");
  if (parts.length !== 2 || parts.some((part) => !part)) {
    throw new ConnectorError({
      provider: "github",
      code: "INVALID_REQUEST",
      message: `Expected GITHUB_DEFAULT_REPOSITORY as owner/repository, received ${repository}`
    });
  }
  return [parts[0], parts[1]];
}

export class MockGitHubCodeHostAdapter extends BaseConnector implements CodeHostAdapter {
  readonly kind = "code-host" as const;
  readonly provider = "github" as const;
  protected readonly requiredEnvironment: string[] = [];
  protected readonly capabilities = ["repositories", "issues", "branches", "pull-requests", "checks", "releases", "webhooks"];
  private readonly repository: string;
  private readonly issues = new Map<string, IssueRecord>();
  private readonly branches = new Map<string, BranchRecord>();
  private readonly pullRequests = new Map<string, PullRequestRecord>();
  private releaseSequence = 0;

  constructor(runtime: AdapterRuntime = {}) {
    super("mock", runtime);
    this.repository = this.env.GITHUB_DEFAULT_REPOSITORY ?? "dailycart/sample-product";
  }

  externalUrl(resource = ""): string {
    return `https://github.com/${this.repository}${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.healthy("Mock GitHub repository is ready.", this.externalUrl());
  }

  async inspectRepository(): Promise<RepositorySnapshot> {
    return {
      fullName: this.repository,
      defaultBranch: "main",
      private: true,
      url: this.externalUrl(),
      openIssues: [...this.issues.values()].filter((issue) => issue.state === "open").length,
      sourceMode: "mocked"
    };
  }

  async createIssue(input: IssueInput): Promise<IssueRecord> {
    const number = this.issues.size + 1;
    const externalId = String(number);
    const record: IssueRecord = {
      provider: "github",
      externalId,
      identifier: `GH-${number}`,
      title: input.title,
      state: "open",
      url: this.externalUrl(`issues/${number}`),
      sourceMode: "mocked"
    };
    this.issues.set(externalId, record);
    return record;
  }

  async createBranch(input: BranchInput): Promise<BranchRecord> {
    const externalId = input.name;
    const record: BranchRecord = {
      provider: "github",
      externalId,
      name: input.name,
      sha: `mock-${Buffer.from(`${input.from ?? "main"}:${input.name}`).toString("hex").slice(0, 32)}`,
      url: this.externalUrl(`tree/${encodeURIComponent(input.name)}`),
      sourceMode: "mocked"
    };
    this.branches.set(externalId, record);
    return record;
  }

  async openPullRequest(input: PullRequestInput): Promise<PullRequestRecord> {
    const number = this.pullRequests.size + 1;
    const externalId = String(number);
    const record: PullRequestRecord = {
      provider: "github",
      externalId,
      number,
      title: input.title,
      head: input.head,
      base: input.base ?? "main",
      state: "open",
      draft: input.draft ?? true,
      url: this.externalUrl(`pull/${number}`),
      sourceMode: "mocked"
    };
    this.pullRequests.set(externalId, record);
    return record;
  }

  async listChecks(ref: string): Promise<CheckRecord[]> {
    return ["lint", "typecheck", "test"].map((name, index) => ({
      id: `mock-check-${index + 1}`,
      name,
      status: "completed",
      conclusion: "success",
      url: this.externalUrl(`actions/runs/mock-${encodeURIComponent(ref)}-${index + 1}`)
    }));
  }

  async createRelease(input: ReleaseInput): Promise<ExternalReference> {
    this.releaseSequence += 1;
    return {
      provider: "github",
      externalId: String(this.releaseSequence),
      url: this.externalUrl(`releases/tag/${encodeURIComponent(input.tag)}`),
      sourceMode: "mocked"
    };
  }
}

interface GitHubInstallationTokenResponse {
  token: string;
  expires_at: string;
}

export class LiveGitHubCodeHostAdapter extends BaseConnector implements CodeHostAdapter {
  readonly kind = "code-host" as const;
  readonly provider = "github" as const;
  protected readonly requiredEnvironment = ["GITHUB_DEFAULT_REPOSITORY"];
  protected readonly capabilities = ["repositories", "issues", "branches", "pull-requests", "checks", "releases", "webhooks"];
  private readonly apiBase: string;
  private cachedInstallationToken?: { token: string; expiresAtMs: number };

  constructor(runtime: AdapterRuntime = {}) {
    super("live", runtime);
    this.apiBase = (this.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");
  }

  override configurationStatus(): ConfigurationStatus {
    const directToken = this.env.GITHUB_TOKEN?.trim() || this.env.GITHUB_INSTALLATION_TOKEN?.trim();
    const appConfigured = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_INSTALLATION_ID"].every((key) => this.env[key]?.trim());
    const missingEnvironment: string[] = [];
    if (!this.env.GITHUB_DEFAULT_REPOSITORY?.trim()) missingEnvironment.push("GITHUB_DEFAULT_REPOSITORY");
    if (!directToken && !appConfigured) missingEnvironment.push("GITHUB_TOKEN or GitHub App credentials");
    const configured = missingEnvironment.length === 0;
    return {
      provider: this.provider,
      mode: this.mode,
      configured,
      writeEnabled: configured,
      requiredEnvironment: ["GITHUB_DEFAULT_REPOSITORY", "GITHUB_TOKEN (or GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_INSTALLATION_ID)"],
      missingEnvironment,
      message: configured
        ? "GitHub credentials are configured; health uses a repository GET before mutations are enabled."
        : `Live GitHub adapter is missing: ${missingEnvironment.join(", ")}.`
    };
  }

  private repository(): string {
    this.assertConfigured();
    return this.env.GITHUB_DEFAULT_REPOSITORY as string;
  }

  externalUrl(resource = ""): string | undefined {
    const repository = this.env.GITHUB_DEFAULT_REPOSITORY;
    if (!repository) return "https://github.com";
    return `https://github.com/${repository}${resource ? `/${resource.replace(/^\//, "")}` : ""}`;
  }

  private createAppJwt(): string {
    const issuedAt = Math.floor(this.now().getTime() / 1_000) - 30;
    const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = encodeBase64Url(JSON.stringify({ iat: issuedAt, exp: issuedAt + 540, iss: this.env.GITHUB_APP_ID }));
    const unsigned = `${header}.${payload}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    const privateKey = (this.env.GITHUB_APP_PRIVATE_KEY as string).replace(/\\n/g, "\n");
    return `${unsigned}.${encodeBase64Url(signer.sign(privateKey))}`;
  }

  private async token(): Promise<string> {
    const direct = this.env.GITHUB_TOKEN?.trim() || this.env.GITHUB_INSTALLATION_TOKEN?.trim();
    if (direct) return direct;
    if (this.cachedInstallationToken && this.cachedInstallationToken.expiresAtMs - 60_000 > this.now().getTime()) {
      return this.cachedInstallationToken.token;
    }
    const response = await requestJson<GitHubInstallationTokenResponse>(
      `${this.apiBase}/app/installations/${encodeURIComponent(this.env.GITHUB_INSTALLATION_ID as string)}/access_tokens`,
      {
        provider: this.provider,
        fetcher: this.fetcher,
        timeoutMs: this.timeoutMs,
        method: "POST",
        headers: jsonHeaders({ authorization: `Bearer ${this.createAppJwt()}`, "x-github-api-version": API_VERSION }),
        body: "{}"
      }
    );
    this.cachedInstallationToken = { token: response.token, expiresAtMs: new Date(response.expires_at).getTime() };
    return response.token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    this.assertConfigured();
    return requestJson<T>(`${this.apiBase}${path}`, {
      provider: this.provider,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      ...init,
      headers: jsonHeaders({
        authorization: `Bearer ${await this.token()}`,
        "x-github-api-version": API_VERSION,
        ...(init.headers as Record<string, string> | undefined)
      })
    });
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return this.safeHealth(async () => {
      const repository = await this.inspectRepository();
      return `Repository ${repository.fullName} is readable.`;
    }, this.externalUrl());
  }

  async inspectRepository(): Promise<RepositorySnapshot> {
    const repository = this.repository();
    splitRepository(repository);
    const response = await this.request<{
      full_name: string;
      default_branch: string;
      private: boolean;
      html_url: string;
      open_issues_count: number;
    }>(`/repos/${repository}`);
    return {
      fullName: response.full_name,
      defaultBranch: response.default_branch,
      private: response.private,
      url: response.html_url,
      openIssues: response.open_issues_count,
      sourceMode: "live"
    };
  }

  async createIssue(input: IssueInput): Promise<IssueRecord> {
    const response = await this.request<{ number: number; title: string; state: "open" | "closed"; html_url: string }>(
      `/repos/${this.repository()}/issues`,
      { method: "POST", body: JSON.stringify({ title: input.title, body: input.description, labels: input.labels, assignees: input.assigneeIds }) }
    );
    return {
      provider: "github",
      externalId: String(response.number),
      identifier: `GH-${response.number}`,
      title: response.title,
      state: response.state,
      url: response.html_url,
      sourceMode: "live"
    };
  }

  async createBranch(input: BranchInput): Promise<BranchRecord> {
    const from = input.from ?? (await this.inspectRepository()).defaultBranch;
    const source = await this.request<{ object: { sha: string } }>(`/repos/${this.repository()}/git/ref/heads/${encodeURIComponent(from)}`);
    const response = await this.request<{ ref: string; object: { sha: string } }>(`/repos/${this.repository()}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${input.name}`, sha: source.object.sha })
    });
    return {
      provider: "github",
      externalId: response.ref,
      name: input.name,
      sha: response.object.sha,
      url: this.externalUrl(`tree/${encodeURIComponent(input.name)}`) as string,
      sourceMode: "live"
    };
  }

  async openPullRequest(input: PullRequestInput): Promise<PullRequestRecord> {
    const base = input.base ?? (await this.inspectRepository()).defaultBranch;
    const response = await this.request<{
      number: number;
      title: string;
      state: "open" | "closed";
      draft: boolean;
      html_url: string;
      head: { ref: string };
      base: { ref: string };
    }>(`/repos/${this.repository()}/pulls`, {
      method: "POST",
      body: JSON.stringify({ title: input.title, body: input.body, head: input.head, base, draft: input.draft ?? true })
    });
    return {
      provider: "github",
      externalId: String(response.number),
      number: response.number,
      title: response.title,
      head: response.head.ref,
      base: response.base.ref,
      state: response.state,
      draft: response.draft,
      url: response.html_url,
      sourceMode: "live"
    };
  }

  async listChecks(ref: string): Promise<CheckRecord[]> {
    const response = await this.request<{ check_runs: Array<{ id: number; name: string; status: CheckRecord["status"]; conclusion: CheckRecord["conclusion"]; html_url?: string }> }>(
      `/repos/${this.repository()}/commits/${encodeURIComponent(ref)}/check-runs`
    );
    return response.check_runs.map((check) => ({
      id: String(check.id),
      name: check.name,
      status: check.status,
      conclusion: check.conclusion,
      url: check.html_url
    }));
  }

  async createRelease(input: ReleaseInput): Promise<ExternalReference> {
    const response = await this.request<{ id: number; html_url: string }>(`/repos/${this.repository()}/releases`, {
      method: "POST",
      body: JSON.stringify({
        tag_name: input.tag,
        name: input.name,
        body: input.notes,
        target_commitish: input.targetCommitish,
        prerelease: input.prerelease ?? false
      })
    });
    return { provider: "github", externalId: String(response.id), url: response.html_url, sourceMode: "live" };
  }
}

export function createCodeHostAdapter(runtime: AdapterRuntime = {}): CodeHostAdapter {
  return (runtime.env ?? process.env).INTEGRATION_MODE === "live"
    ? new LiveGitHubCodeHostAdapter(runtime)
    : new MockGitHubCodeHostAdapter(runtime);
}
