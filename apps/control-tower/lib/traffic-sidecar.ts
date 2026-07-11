import type { TrafficRunResult } from "@dailycart/connectors";

let runSequence = 0;
let running = false;
let lastRun: TrafficRunResult | undefined;

export function nextTrafficRunSequence(): number {
  runSequence += 1;
  return runSequence;
}

export function isTrafficRunning(): boolean {
  return running;
}

export function setTrafficRunning(value: boolean): void {
  running = value;
}

export function saveTrafficRun(run: TrafficRunResult): void {
  lastRun = run;
}

export function currentTrafficRun(): TrafficRunResult | undefined {
  return lastRun ? structuredClone(lastRun) : undefined;
}
