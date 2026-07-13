import { assertDemoState, type DemoState } from "@dailycart/schemas";
import { createSessionDemoState, fallbackDemoState } from "./demo-state";
import { readArtifact } from "./durable-artifacts";

export async function loadDemoState(sessionId?: string): Promise<DemoState> {
  try {
    const stored = await readArtifact<DemoState>("demoState", sessionId);
    if (stored) return assertDemoState(stored);
  } catch { /* The schema-valid fixture keeps public browsing operational. */ }
  return sessionId ? createSessionDemoState() : fallbackDemoState;
}
