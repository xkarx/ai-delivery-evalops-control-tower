export type DemoMode = "synthetic" | "off";
export type IntegrationMode = "mock" | "live";

export interface AppConfig {
  appUrl: string;
  demoMode: DemoMode;
  integrationMode: IntegrationMode;
  syntheticDataSeed: number;
  model: string;
  providers: Record<string, boolean>;
}

const truthy = (value: string | undefined) => Boolean(value?.trim());

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const demoMode = env.DEMO_MODE === "off" ? "off" : "synthetic";
  const integrationMode = env.INTEGRATION_MODE === "live" ? "live" : "mock";
  const seed = Number.parseInt(env.SYNTHETIC_DATA_SEED ?? "20260710", 10);

  if (!Number.isFinite(seed)) {
    throw new Error("SYNTHETIC_DATA_SEED must be an integer");
  }

  return {
    appUrl: env.APP_URL ?? "http://localhost:3000",
    demoMode,
    integrationMode,
    syntheticDataSeed: seed,
    model: env.OPENAI_MODEL ?? "mock-evidence-ranker-v1",
    providers: {
      github: truthy(env.GITHUB_APP_ID) && truthy(env.GITHUB_INSTALLATION_ID),
      slack: truthy(env.SLACK_BOT_TOKEN) && truthy(env.SLACK_SIGNING_SECRET),
      linear: truthy(env.LINEAR_API_KEY) && truthy(env.LINEAR_TEAM_ID),
      supabase: truthy(env.NEXT_PUBLIC_SUPABASE_URL) && truthy(env.SUPABASE_SERVICE_ROLE_KEY),
      langfuse: truthy(env.LANGFUSE_PUBLIC_KEY) && truthy(env.LANGFUSE_SECRET_KEY),
      posthog: truthy(env.NEXT_PUBLIC_POSTHOG_KEY),
      deployment: truthy(env.VERCEL_TOKEN) && truthy(env.VERCEL_PROJECT_ID)
    }
  };
}

export function assertModeSafety(config: AppConfig): void {
  if (config.integrationMode === "live") {
    const configured = Object.values(config.providers).filter(Boolean).length;
    if (configured === 0) {
      throw new Error("INTEGRATION_MODE=live requires at least one configured provider");
    }
  }
}
