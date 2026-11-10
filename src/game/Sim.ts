import { Motives } from "./Motives.ts";
import { Personality } from "./Personality.ts";
import { findPath, type GridPoint } from "../engine/Pathfinding.ts";
import { TRAIT_FOR_MOTIVE } from "./types.ts";
import { compatibility, describeChatMemory, relationshipLabel, type FamilyRelation } from "./Relationships.ts";
import type { Lot } from "./Lot.ts";
import type { GameObject, Interaction } from "./GameObject.ts";
import type { Pet } from "./Pet.ts";

export type SimState = "idle" | "walking" | "using" | "socializing" | "petting" | "atWork";

const WALK_SPEED_TILES_PER_MINUTE = 6;
// How long (in sim-minutes) a Sim with nothing urgent to do waits before
// wandering off to a nearby spot, same idea as Pet's wander habit — idle
// Sims used to just stand frozen for the (realistic, hours-long) stretch
// between urgent needs, which read as dead rather than relaxed. Shorter
// than Pet's 45 minutes since a Sim standing around is more noticeable.
const IDLE_WANDER_INTERVAL_MINUTES = 20;
const IDLE_WANDER_RADIUS = 4;
const SOCIAL_GAIN_PER_MINUTE = 6;
const SOCIAL_FUN_GAIN_PER_MINUTE = 2;
const SOCIAL_DURATION_MINUTES = 20;
const RELATIONSHIP_GAIN_PER_MINUTE = 0.5;
// Slower than friendship, and gated on friendship already being established
// (see stepSocializing) — romance builds on top of rapport rather than from
// a first conversation.
const ROMANCE_GAIN_PER_MINUTE = 0.15;
const ROMANCE_FRIENDSHIP_THRESHOLD = 20;
const MIN_RELATIONSHIP = -100;
const MAX_RELATIONSHIP = 100;
const PET_FUN_GAIN_PER_MINUTE = 8;
const PET_SOCIAL_GAIN_PER_MINUTE = 2;
const PET_DURATION_MINUTES = 15;
export const MAX_MEMORIES = 12;

export class Sim {
  readonly id: number;
  name: string;
  color: number;
  x: number;
  y: number;
  facing: { dx: number; dy: number } = { dx: 0, dy: 1 };
  motives: Motives;
  personality: Personality;
  private relationships = new Map<number, number>();
  private romances = new Map<number, number>();
  private familyRelations = new Map<number, FamilyRelation>();
  state: SimState = "idle";
  currentAction = "Idle";
  /** The career track's id (see game/Job.ts), or null if unemployed. */
  careerId: string | null = null;
  /** Index into the track's levels array. */
  careerLevel = 0;
  /** 0-100 progress toward the next promotion; see Jobs.ts. */
  promotionProgress = 0;

  path: GridPoint[] = [];
  private onArrive: (() => void) | null = null;

  currentInteraction: { object: GameObject; interaction: Interaction; elapsed: number } | null =
    null;

  socialPartner: Sim | null = null;
  private socialElapsed = 0;
  private socialStartRelationship = 0;
  private socialStartRomance = 0;
  /** A short, newest-last log of notable moments from this Sim's own point of view (see Relationships.describeChatMemory). */
  memories: string[] = [];

  currentPet: Pet | null = null;
  private petElapsed = 0;

  private idleMinutes = 0;
  private nextWanderAt: number;

  constructor(id: number, name: string, color: number, x: number, y: number, personality?: Personality) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.x = x;
    this.y = y;
    this.motives = new Motives();
    this.personality = personality ?? new Personality();
    this.nextWanderAt = IDLE_WANDER_INTERVAL_MINUTES * (0.5 + Math.random());
  }

  getRelationship(simId: number): number {
    return this.relationships.get(simId) ?? 0;
  }

  adjustRelationship(simId: number, delta: number): void {
    const value = this.getRelationship(simId) + delta;
    this.relationships.set(simId, Math.max(MIN_RELATIONSHIP, Math.min(MAX_RELATIONSHIP, value)));
  }

  relationshipEntries(): [number, number][] {
    return [...this.relationships.entries()];
  }

  getRomance(simId: number): number {
    return this.romances.get(simId) ?? 0;
  }

  adjustRomance(simId: number, delta: number): void {
    const value = this.getRomance(simId) + delta;
    this.romances.set(simId, Math.max(MIN_RELATIONSHIP, Math.min(MAX_RELATIONSHIP, value)));
  }

  romanceEntries(): [number, number][] {
    return [...this.romances.entries()];
  }

  getFamilyRelation(simId: number): FamilyRelation {
    return this.familyRelations.get(simId) ?? "none";
  }

  /**
   * Sets only this Sim's side of the tie. Callers that want a consistent
   * pair (e.g. A's "parent" implying B's "child") should also set the
   * inverse on the other Sim — see Relationships.inverseFamilyRelation and
   * main.ts's setFamilyRelation, which does both sides at once.
   */
  setFamilyRelationRaw(simId: number, relation: FamilyRelation): void {
    if (relation === "none") this.familyRelations.delete(simId);
    else this.familyRelations.set(simId, relation);
  }

  familyRelationEntries(): [number, FamilyRelation][] {
    return [...this.familyRelations.entries()];
  }

  /** Quit (null) or start fresh at level 0 of a new career track. */
  setCareer(careerId: string | null): void {
    this.careerId = careerId;
    this.careerLevel = 0;
    this.promotionProgress = 0;
  }

  get gridX(): number {
    return Math.round(this.x);
  }

  get gridY(): number {
    return Math.round(this.y);
  }

  /** Attempt to path to (tx,ty). Returns false if unreachable. */
  walkTo(lot: Lot, tx: number, ty: number, onArrive?: () => void): boolean {
    const path = findPath({ x: this.gridX, y: this.gridY }, { x: tx, y: ty }, (x1, y1, x2, y2) =>
      lot.canMove(x1, y1, x2, y2),
    );
    if (path === null) return false;

    if (path.length === 0) {
      onArrive?.();
      return true;
    }

    this.path = path;
    this.state = "walking";
    this.currentAction = "Walking";
    this.onArrive = onArrive ?? null;
    return true;
  }

  startUsing(object: GameObject, interaction: Interaction): void {
    this.state = "using";
    this.currentInteraction = { object, interaction, elapsed: 0 };
    object.occupiedBy = this;
    this.currentAction = interaction.label;
    this.facing = { dx: object.gridX - this.gridX, dy: object.gridY - this.gridY };
  }

  private stopUsing(): void {
    if (this.currentInteraction) {
      this.currentInteraction.object.occupiedBy = null;
      this.currentInteraction = null;
    }
    this.state = "idle";
    this.currentAction = "Idle";
  }

  startSocializing(partner: Sim): void {
    this.state = "socializing";
    this.socialPartner = partner;
    this.socialElapsed = 0;
    this.socialStartRelationship = this.getRelationship(partner.id);
    this.socialStartRomance = this.getRomance(partner.id);
    this.currentAction = `Chatting with ${partner.name}`;
    this.facing = { dx: partner.gridX - this.gridX, dy: partner.gridY - this.gridY };
  }

  private stopSocializing(): void {
    if (this.socialPartner) this.recordChatMemory(this.socialPartner);
    this.state = "idle";
    this.currentAction = "Idle";
    this.socialPartner = null;
  }

  private recordChatMemory(partner: Sim): void {
    const oldLabel = relationshipLabel(this.socialStartRelationship, this.socialStartRomance);
    const newRelationship = this.getRelationship(partner.id);
    const newLabel = relationshipLabel(newRelationship, this.getRomance(partner.id));
    const delta = newRelationship - this.socialStartRelationship;
    this.memories.push(describeChatMemory(partner.name, oldLabel, newLabel, delta));
    if (this.memories.length > MAX_MEMORIES) this.memories.shift();
  }

  startPetting(pet: Pet): void {
    this.state = "petting";
    this.currentPet = pet;
    this.petElapsed = 0;
    this.currentAction = `Petting ${pet.name}`;
    this.facing = { dx: pet.gridX - this.gridX, dy: pet.gridY - this.gridY };
    pet.facing = { dx: this.gridX - pet.gridX, dy: this.gridY - pet.gridY };
  }

  private stopPetting(): void {
    if (this.currentPet) {
      this.currentPet.occupiedBy = null;
      this.currentPet = null;
    }
    this.state = "idle";
    this.currentAction = "Idle";
  }

  /** Cancel whatever the sim is currently doing and return to idle. */
  interrupt(): void {
    if (this.state === "using") this.stopUsing();
    else if (this.state === "socializing") this.stopSocializing();
    else if (this.state === "petting") this.stopPetting();
    this.path = [];
    this.onArrive = null;
    this.state = "idle";
    this.currentAction = "Idle";
  }

  update(simMinutes: number, lot: Lot): void {
    this.motives.decay(simMinutes);

    switch (this.state) {
      case "walking":
        this.stepWalk(simMinutes, lot);
        break;
      case "using":
        this.stepUsing(simMinutes);
        break;
      case "socializing":
        this.stepSocializing(simMinutes);
        break;
      case "petting":
        this.stepPetting(simMinutes);
        break;
      case "idle":
        this.stepIdle(simMinutes, lot);
        break;
      case "atWork":
        break;
    }

    // Room isn't a decaying need — it's a direct read of the Sim's current
    // surroundings, recomputed every tick. Skipped while at work since
    // they're off the lot entirely and have no "current room" to reflect.
    if (this.state !== "atWork") {
      this.motives.set("room", lot.computeRoomScore(this.gridX, this.gridY));
    }
  }

  private stepWalk(simMinutes: number, lot: Lot): void {
    let remaining = simMinutes * WALK_SPEED_TILES_PER_MINUTE;
    while (remaining > 0 && this.path.length > 0) {
      const next = this.path[0];
      if (!lot.canMove(this.gridX, this.gridY, next.x, next.y)) {
        // Path became blocked (e.g. a wall was built); abandon it.
        this.path = [];
        break;
      }
      const dx = next.x - this.x;
      const dy = next.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= remaining || dist === 0) {
        this.x = next.x;
        this.y = next.y;
        if (dx !== 0 || dy !== 0) this.facing = { dx: Math.sign(dx), dy: Math.sign(dy) };
        remaining -= dist;
        this.path.shift();
      } else {
        const t = remaining / dist;
        this.x += dx * t;
        this.y += dy * t;
        this.facing = { dx: Math.sign(dx), dy: Math.sign(dy) };
        remaining = 0;
      }
    }

    if (this.path.length === 0) {
      this.state = "idle";
      this.currentAction = "Idle";
      const cb = this.onArrive;
      this.onArrive = null;
      cb?.();
    }
  }

  private stepUsing(simMinutes: number): void {
    const ci = this.currentInteraction;
    if (!ci) {
      this.state = "idle";
      return;
    }
    ci.elapsed += simMinutes;
    const trait = TRAIT_FOR_MOTIVE[ci.interaction.motive];
    const traitMult = trait ? this.personality.multiplier(trait) : 1;
    this.motives.add(ci.interaction.motive, ci.interaction.gainPerMinute * traitMult * simMinutes);
    if (ci.elapsed >= ci.interaction.durationMinutes || this.motives.get(ci.interaction.motive) >= 95) {
      this.stopUsing();
    }
  }

  private stepSocializing(simMinutes: number): void {
    this.socialElapsed += simMinutes;
    this.motives.add("social", SOCIAL_GAIN_PER_MINUTE * this.personality.multiplier("outgoing") * simMinutes);
    this.motives.add("fun", SOCIAL_FUN_GAIN_PER_MINUTE * this.personality.multiplier("playful") * simMinutes);
    if (this.socialPartner) {
      // Compatibility can be negative for clashing personalities, so this
      // isn't just "friendship builds slower" for a mismatched pair — it can
      // genuinely trend toward dislike, even for a Sim high in Nice (Nice
      // scales the intensity of the reaction, not its direction).
      const compat = compatibility(this.personality, this.socialPartner.personality);
      const relGain = RELATIONSHIP_GAIN_PER_MINUTE * this.personality.multiplier("nice") * compat * simMinutes;
      this.adjustRelationship(this.socialPartner.id, relGain);

      if (compat > 0 && this.getRelationship(this.socialPartner.id) >= ROMANCE_FRIENDSHIP_THRESHOLD) {
        const family = this.getFamilyRelation(this.socialPartner.id);
        // Spouses already have romance by definition, and strangers (no tie
        // set) can develop it normally; a sibling/parent/child tie is the
        // one case that should never accrue romance, however compatible the
        // personalities are.
        if (family !== "sibling" && family !== "parent" && family !== "child") {
          const romanceGain = ROMANCE_GAIN_PER_MINUTE * this.personality.multiplier("playful") * compat * simMinutes;
          this.adjustRomance(this.socialPartner.id, romanceGain);
        }
      }
    }
    if (this.socialElapsed >= SOCIAL_DURATION_MINUTES || this.motives.get("social") >= 95) {
      this.stopSocializing();
    }
  }

  private stepPetting(simMinutes: number): void {
    if (!this.currentPet) {
      this.state = "idle";
      return;
    }
    this.petElapsed += simMinutes;
    this.motives.add("fun", PET_FUN_GAIN_PER_MINUTE * this.personality.multiplier("playful") * simMinutes);
    this.motives.add("social", PET_SOCIAL_GAIN_PER_MINUTE * simMinutes);
    if (this.petElapsed >= PET_DURATION_MINUTES || this.motives.get("fun") >= 95) {
      this.stopPetting();
    }
  }

  /**
   * With nothing urgent to do, a Sim left standing for the realistic
   * (hours-long) stretch between needs reads as frozen rather than relaxed.
   * Every so often, if no motive is actually in urgent territory, send them
   * for a short stroll nearby instead — purely cosmetic, same idea as Pet's
   * wander habit. If AI.ts has something more pressing in mind for this Sim
   * this same tick, it runs after this and simply finds them no longer idle
   * (having just set off walking), same as it already treats a Sim another
   * caller sent walking for any other reason.
   */
  private stepIdle(simMinutes: number, lot: Lot): void {
    this.idleMinutes += simMinutes;
    if (this.idleMinutes < this.nextWanderAt) return;
    this.idleMinutes = 0;
    this.nextWanderAt = IDLE_WANDER_INTERVAL_MINUTES * (0.5 + Math.random());
    if (this.motives.mostUrgent() !== null) return; // let AI.ts handle it instead

    const tx = Math.max(0, Math.min(lot.width - 1, this.gridX + Math.round((Math.random() * 2 - 1) * IDLE_WANDER_RADIUS)));
    const ty = Math.max(0, Math.min(lot.height - 1, this.gridY + Math.round((Math.random() * 2 - 1) * IDLE_WANDER_RADIUS)));
    this.walkTo(lot, tx, ty);
  }
}
