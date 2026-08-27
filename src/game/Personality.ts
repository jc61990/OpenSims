import { TRAIT_TYPES, type TraitType } from "./types.ts";

const MIN_VALUE = 0;
const MAX_VALUE = 10;

export class Personality {
  private values: Record<TraitType, number>;

  constructor(initial: Partial<Record<TraitType, number>> = {}) {
    this.values = {
      neat: 5,
      outgoing: 5,
      active: 5,
      playful: 5,
      nice: 5,
      ...initial,
    };
  }

  get(trait: TraitType): number {
    return this.values[trait];
  }

  set(trait: TraitType, value: number): void {
    this.values[trait] = Math.max(MIN_VALUE, Math.min(MAX_VALUE, value));
  }

  /** Multiplier (roughly 0.7-1.3) for gains tied to this trait — 5 is neutral (1.0). */
  multiplier(trait: TraitType): number {
    return 0.7 + (this.values[trait] / MAX_VALUE) * 0.6;
  }

  snapshot(): Record<TraitType, number> {
    return { ...this.values };
  }
}

export function randomPersonality(rng: () => number = Math.random): Personality {
  const values: Partial<Record<TraitType, number>> = {};
  for (const trait of TRAIT_TYPES) {
    values[trait] = 2 + Math.round(rng() * 6); // 2..8, avoids extreme outliers
  }
  return new Personality(values);
}
