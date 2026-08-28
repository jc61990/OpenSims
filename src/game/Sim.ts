import { Motives } from "./Motives.ts";
import { Personality } from "./Personality.ts";
import { findPath, type GridPoint } from "../engine/Pathfinding.ts";
import { TRAIT_FOR_MOTIVE } from "./types.ts";
import type { Lot } from "./Lot.ts";
import type { GameObject, Interaction } from "./GameObject.ts";

export type SimState = "idle" | "walking" | "using" | "socializing" | "atWork";

const WALK_SPEED_TILES_PER_MINUTE = 6;
const SOCIAL_GAIN_PER_MINUTE = 6;
const SOCIAL_FUN_GAIN_PER_MINUTE = 2;
const SOCIAL_DURATION_MINUTES = 20;
const RELATIONSHIP_GAIN_PER_MINUTE = 0.5;
const MIN_RELATIONSHIP = -100;
const MAX_RELATIONSHIP = 100;

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
  state: SimState = "idle";
  currentAction = "Idle";
  jobId: string | null = null;

  path: GridPoint[] = [];
  private onArrive: (() => void) | null = null;

  currentInteraction: { object: GameObject; interaction: Interaction; elapsed: number } | null =
    null;

  socialPartner: Sim | null = null;
  private socialElapsed = 0;

  constructor(id: number, name: string, color: number, x: number, y: number, personality?: Personality) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.x = x;
    this.y = y;
    this.motives = new Motives();
    this.personality = personality ?? new Personality();
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
    this.currentAction = `Chatting with ${partner.name}`;
    this.facing = { dx: partner.gridX - this.gridX, dy: partner.gridY - this.gridY };
  }

  private stopSocializing(): void {
    this.state = "idle";
    this.currentAction = "Idle";
    this.socialPartner = null;
  }

  /** Cancel whatever the sim is currently doing and return to idle. */
  interrupt(): void {
    if (this.state === "using") this.stopUsing();
    else if (this.state === "socializing") this.stopSocializing();
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
      case "idle":
      case "atWork":
        break;
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
      const gain = RELATIONSHIP_GAIN_PER_MINUTE * this.personality.multiplier("nice") * simMinutes;
      this.adjustRelationship(this.socialPartner.id, gain);
    }
    if (this.socialElapsed >= SOCIAL_DURATION_MINUTES || this.motives.get("social") >= 95) {
      this.stopSocializing();
    }
  }
}
