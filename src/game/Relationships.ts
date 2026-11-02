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

/**
 * A fixed household/family tie, independent of the emotional scalars above —
 * set explicitly by the player rather than derived from behavior. Takes
 * precedence over the emotional tier label when shown in the HUD: a spouse
 * is a spouse regardless of how the friendship/romance numbers are doing
 * that day. Parent and child are each other's inverse (see
 * inverseFamilyRelation); spouse and sibling are their own inverse.
 */
export type FamilyRelation = "none" | "spouse" | "sibling" | "parent" | "child";

export const FAMILY_RELATION_LABELS: Record<Exclude<FamilyRelation, "none">, string> = {
  spouse: "Spouse",
  sibling: "Sibling",
  parent: "Parent",
  child: "Child",
};

export const FAMILY_RELATION_COLORS: Record<Exclude<FamilyRelation, "none">, string> = {
  spouse: "#ffd24a",
  sibling: "#6ab0e0",
  parent: "#6ab0e0",
  child: "#6ab0e0",
};

export function inverseFamilyRelation(relation: FamilyRelation): FamilyRelation {
  if (relation === "parent") return "child";
  if (relation === "child") return "parent";
  return relation;
}

// A rough "how good is this tier" ordering, used only to decide whether a
// chat-ending tier change reads as an upgrade or a downgrade for memory
// flavor text — not a claim that Crush/Sweetheart are strictly "better"
// than Best Friend on the same axis, just a practical ordering for prose.
const TIER_RANK: Record<RelationshipLabel, number> = {
  Enemy: 0,
  Rival: 1,
  Acquaintance: 2,
  Friend: 3,
  "Best Friend": 4,
  Crush: 5,
  Sweetheart: 6,
};

/**
 * Flavor text for one Sim's memory log entry (Sim.ts's `memories`),
 * summarizing a single completed chat from that Sim's own point of view. A
 * tier change (crossing into/out of Friend, Sweetheart, etc.) is the more
 * memorable event, so it takes priority over the raw relationship delta
 * when one happened during the chat.
 */
export function describeChatMemory(
  partnerName: string,
  oldLabel: RelationshipLabel,
  newLabel: RelationshipLabel,
  relationshipDelta: number,
): string {
  if (newLabel !== oldLabel) {
    const improved = TIER_RANK[newLabel] > TIER_RANK[oldLabel];
    if (improved) {
      switch (newLabel) {
        case "Sweetheart":
          return `Became ${partnerName}'s sweetheart.`;
        case "Crush":
          return `Developed a crush on ${partnerName}.`;
        case "Best Friend":
          return `Became best friends with ${partnerName}.`;
        case "Friend":
          return `Became friends with ${partnerName}.`;
        default:
          return `Started to patch things up with ${partnerName}.`;
      }
    }
    switch (newLabel) {
      case "Enemy":
        return `Became enemies with ${partnerName}.`;
      case "Rival":
        return `Became rivals with ${partnerName}.`;
      case "Best Friend":
        return `The spark faded with ${partnerName}.`;
      case "Friend":
        return `Things cooled off with ${partnerName}.`;
      default:
        return `Drifted apart from ${partnerName}.`;
    }
  }
  if (relationshipDelta >= 8) return `Really hit it off with ${partnerName}.`;
  if (relationshipDelta > 0) return `Had a nice chat with ${partnerName}.`;
  if (relationshipDelta <= -8) return `Clashed with ${partnerName}.`;
  if (relationshipDelta < 0) return `Had an awkward conversation with ${partnerName}.`;
  return `Chatted with ${partnerName}.`;
}
