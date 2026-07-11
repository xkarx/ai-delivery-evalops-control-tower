/** The adapter mode used by server-rendered controls and status labels. */
export type RuntimeMode = "live" | "mock";

export function getRuntimeMode(env: NodeJS.ProcessEnv = process.env): RuntimeMode {
  return env.INTEGRATION_MODE === "live" ? "live" : "mock";
}

