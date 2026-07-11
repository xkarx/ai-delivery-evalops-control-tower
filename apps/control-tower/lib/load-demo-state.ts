import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertDemoState, type DemoState } from "@dailycart/schemas";
import { fallbackDemoState } from "./demo-state";

const candidates = [
  path.resolve(process.cwd(), "../../artifacts/demo-state.json"),
  path.resolve(process.cwd(), "artifacts/demo-state.json")
];

export async function loadDemoState(): Promise<DemoState> {
  for (const candidate of candidates) {
    try {
      return assertDemoState(JSON.parse(await readFile(candidate, "utf8")));
    } catch {
      // The checked-in, schema-valid fixture keeps a fresh clone operational.
    }
  }
  return fallbackDemoState;
}
