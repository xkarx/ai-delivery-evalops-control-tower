/** A small dependency-free PRNG so fixtures are stable across machines. */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  integer(minimum: number, maximum: number): number {
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum < minimum) {
      throw new Error(`Invalid integer range ${minimum}..${maximum}`);
    }
    return Math.floor(this.next() * (maximum - minimum + 1)) + minimum;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new Error("Cannot pick from an empty list");
    }
    return values[this.integer(0, values.length - 1)] as T;
  }

  weightedPick<T>(entries: readonly { value: T; weight: number }[]): T {
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (entries.length === 0 || total <= 0) {
      throw new Error("Weighted choices require at least one positive weight");
    }

    let cursor = this.next() * total;
    for (const entry of entries) {
      cursor -= entry.weight;
      if (cursor < 0) {
        return entry.value;
      }
    }
    return entries[entries.length - 1]!.value;
  }
}

/** FNV-1a combines a numeric seed and scenario without relying on process hashing. */
export function scenarioSeed(seed: number, scenario: string): number {
  let hash = 0x811c9dc5;
  const input = `${seed}:${scenario}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
