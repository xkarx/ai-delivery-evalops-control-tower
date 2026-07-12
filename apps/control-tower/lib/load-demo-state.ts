import { assertDemoState, type DemoState } from "@dailycart/schemas";
import { fallbackDemoState } from "./demo-state";
import { readArtifact } from "./durable-artifacts";

export async function loadDemoState(): Promise<DemoState> {
  try {
    const stored = await readArtifact<DemoState>("demoState");
    if (stored) return assertDemoState(stored);
  } catch { /* The schema-valid fixture keeps public browsing operational. */ }
  return fallbackDemoState;
}
