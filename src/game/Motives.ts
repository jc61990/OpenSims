import { MOTIVE_DECAY_PER_HOUR, MOTIVE_TYPES, type MotiveType } from "./types.ts";

const MIN_VALUE = -100;
const MAX_VALUE = 100;

export class Motives {
  private values: Record<MotiveType, number>;

  constructor(initial: Partial<Record<MotiveType, number>> = {}) {
    this.values = {
      hunger: 60,
      energy: 70,
      bladder: 80,
      hygiene: 70,
      social: 50,
      fun: 50,
      room: 50,
      ...initial,
    };
  }

  get(motive: MotiveType): number {
    return this.values[motive];
  }

  set(motive: MotiveType, value: number): void {
    this.values[motive] = Math.max(MIN_VALUE, Math.min(MAX_VALUE, value));
  }

  add(motive: MotiveType, delta: number): void {
    this.set(motive, this.values[motive] + delta);
  }

  /** Advance decay by the given number of elapsed sim-minutes. */
  decay(simMinutes: number): void {
    if (simMinutes <= 0) return;
    for (const motive of MOTIVE_TYPES) {
      const perMinute = MOTIVE_DECAY_PER_HOUR[motive] / 60;
      this.add(motive, -perMinute * simMinutes);
    }
  }

  /** Overall mood: average of all motives, -100..100. */
  get mood(): number {
    const sum = MOTIVE_TYPES.reduce((acc, m) => acc + this.values[m], 0);
    return sum / MOTIVE_TYPES.length;
  }

  /** The motive in most urgent need of attention, if any is below threshold. */
  mostUrgent(threshold = -10): MotiveType | null {
    let worst: MotiveType | null = null;
    let worstValue = threshold;
    for (const motive of MOTIVE_TYPES) {
      if (this.values[motive] < worstValue) {
        worstValue = this.values[motive];
        worst = motive;
      }
    }
    return worst;
  }

  snapshot(): Record<MotiveType, number> {
    return { ...this.values };
  }
}
