export interface SeededRandom {
  next(): number;
  integer(minInclusive: number, maxExclusive: number): number;
  chance(probability: number): boolean;
  pickWeighted<T extends string>(weights: Record<T, number>): T;
}

export function createSeededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;
  const next = (): number => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
  return {
    next,
    integer(minInclusive, maxExclusive) {
      if (maxExclusive <= minInclusive) return minInclusive;
      return Math.floor(next() * (maxExclusive - minInclusive)) + minInclusive;
    },
    chance(probability) {
      return next() < probability;
    },
    pickWeighted<T extends string>(weights: Record<T, number>): T {
      const entries = Object.entries(weights) as Array<[T, number]>;
      const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
      if (total <= 0) return entries[0][0];
      let cursor = next() * total;
      for (const [value, weight] of entries) {
        cursor -= Math.max(0, weight);
        if (cursor <= 0) return value;
      }
      return entries[entries.length - 1][0];
    }
  };
}
