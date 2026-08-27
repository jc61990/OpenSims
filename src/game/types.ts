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

// A simplified version of The Sims 1's five-axis personality system. Purely
// original gameplay numbers — see README for why nothing here touches EA's
// actual assets or expression.
export type TraitType = "neat" | "outgoing" | "active" | "playful" | "nice";

export const TRAIT_TYPES: TraitType[] = ["neat", "outgoing", "active", "playful", "nice"];

export const TRAIT_LABELS: Record<TraitType, string> = {
  neat: "Neat",
  outgoing: "Outgoing",
  active: "Active",
  playful: "Playful",
  nice: "Nice",
};

/** Which trait, if any, modulates how effectively a Sim gains from a given motive's interactions. */
export const TRAIT_FOR_MOTIVE: Partial<Record<MotiveType, TraitType>> = {
  fun: "playful",
  social: "outgoing",
  hygiene: "neat",
};
