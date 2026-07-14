import { randomInt } from "node:crypto";

export function createIncidentNumericId(now = Date.now(), entropy = randomInt(1000, 10_000)): string {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("Incident timestamp must be a non-negative safe integer.");
  if (!Number.isInteger(entropy) || entropy < 1000 || entropy > 9999) throw new Error("Incident entropy must contain four decimal digits.");
  return `${now}${entropy}`;
}
