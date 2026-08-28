export type MotiveType = "hunger" | "energy" | "bladder" | "hygiene" | "social" | "fun" | "room";

export const MOTIVE_TYPES: MotiveType[] = [
  "hunger",
  "energy",
  "bladder",
  "hygiene",
  "social",
  "fun",
  "room",
];

export const MOTIVE_LABELS: Record<MotiveType, string> = {
  hunger: "Hunger",
  energy: "Energy",
  bladder: "Bladder",
  hygiene: "Hygiene",
  social: "Social",
  fun: "Fun",
  room: "Room",
};

// Motive decay per sim-hour, tuned loosely after Sims 1 pacing. Room doesn't
// decay on its own — it's recomputed fresh every tick from the Sim's current
// surroundings (Lot.computeRoomScore), so it has no drift rate of its own.
export const MOTIVE_DECAY_PER_HOUR: Record<MotiveType, number> = {
  hunger: 4,
  energy: 3,
  bladder: 5,
  hygiene: 3,
  social: 2.5,
  fun: 2.5,
  room: 0,
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

/** Shared palette for auto-assigned and player-picked Sim colors. */
export const SIM_COLOR_POOL = [0x4a7bd6, 0xd64a7b, 0x4ad67f, 0xd6a54a, 0x9a6ac2, 0x4ad6d0];
