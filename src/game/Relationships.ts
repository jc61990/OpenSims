import type { Personality } from "./Personality.ts";
import { TRAIT_TYPES } from "./types.ts";

/**
 * How well two personalities get along, from -1 (max clash) to 1 (identical
 * traits) — the average absolute difference across all five traits (each
 * 0-10, so a max diff of 10), normalized and flipped so similarity reads
 * positive. Scales how relationships trend during socializing (Sim.ts) —
 * mismatched Sims can genuinely drift toward dislike, not just build
 * friendship more slowly.
 */
export function compatibility(a: Personality, b: Personality): number {
  let totalDiff = 0;
  for (const t of TRAIT_TYPES) {
    totalDiff += Math.abs(a.get(t) - b.get(t));
  }
  const avgDiff = totalDiff / TRAIT_TYPES.length; // 0..10
  return 1 - avgDiff / 5; // 1 (identical) .. -1 (max clash)
}

export type RelationshipLabel = "Sweetheart" | "Crush" | "Best Friend" | "Friend" | "Acquaintance" | "Rival" | "Enemy";

/**
 * A Sims-style tier label derived from the two relationship scalars
 * (friendship and romance, each -100..100). Romance only produces a label
 * once it's climbed high enough that it means something — a low romance
 * value alongside a low friendship value just reads as Acquaintance.
 */
export function relationshipLabel(relationship: number, romance: number): RelationshipLabel {
  if (romance >= 60) return "Sweetheart";
  if (romance >= 25 && relationship >= 20) return "Crush";
  if (relationship <= -40) return "Enemy";
  if (relationship >= 60) return "Best Friend";
  if (relationship >= 20) return "Friend";
  if (relationship <= -10) return "Rival";
  return "Acquaintance";
}

export const RELATIONSHIP_LABEL_COLORS: Record<RelationshipLabel, string> = {
  Sweetheart: "#ff6fa5",
  Crush: "#ff8fb8",
  "Best Friend": "#55c778",
  Friend: "#7fd6a0",
  Acquaintance: "#a0a8b8",
  Rival: "#e0a055",
  Enemy: "#e05555",
};
