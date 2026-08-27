export type MotiveType = "hunger" | "energy" | "bladder" | "hygiene" | "social" | "fun";

export const MOTIVE_TYPES: MotiveType[] = [
  "hunger",
  "energy",
  "bladder",
  "hygiene",
  "social",
  "fun",
];

export const MOTIVE_LABELS: Record<MotiveType, string> = {
  hunger: "Hunger",
  energy: "Energy",
  bladder: "Bladder",
  hygiene: "Hygiene",
  social: "Social",
  fun: "Fun",
};

// Motive decay per sim-hour, tuned loosely after Sims 1 pacing.
export const MOTIVE_DECAY_PER_HOUR: Record<MotiveType, number> = {
  hunger: 4,
  energy: 3,
  bladder: 5,
  hygiene: 3,
  social: 2.5,
  fun: 2.5,
};

export interface GridPos {
  x: number;
  y: number;
}
