import { findPath, type GridPoint } from "../engine/Pathfinding.ts";
import type { Lot } from "./Lot.ts";
import type { Sim } from "./Sim.ts";

export type PetType = "dog" | "cat";
export type PetState = "idle" | "walking";

const WALK_SPEED_TILES_PER_MINUTE = 5;
// How long (in sim-minutes) an idle pet waits before wandering to a new spot
// — randomized per-wait so a household of pets doesn't all move in lockstep.
const WANDER_INTERVAL_MINUTES = 45;
const WANDER_RADIUS = 4;

/**
 * A much lighter entity than Sim: no motives, no jobs, no interactions —
 * just a position and a wander habit, enough to make the lot feel lived-in
 * without a second needs system. Bought from the Town shop (HUD.ts) rather
 * than placed in Buy mode.
 */
export class Pet {
  readonly id: number;
  name: string;
  readonly type: PetType;
  color: number;
  x: number;
  y: number;
  facing: { dx: number; dy: number } = { dx: 0, dy: 1 };
  state: PetState = "idle";
  path: GridPoint[] = [];
  /** The Sim currently petting it, if any — held still and unavailable to others until they finish. */
  occupiedBy: Sim | null = null;
  private idleMinutes = 0;
  private nextWanderAt: number;

  constructor(id: number, name: string, type: PetType, color: number, x: number, y: number) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.color = color;
    this.x = x;
    this.y = y;
    this.nextWanderAt = WANDER_INTERVAL_MINUTES * Math.random();
  }

  get gridX(): number {
    return Math.round(this.x);
  }

  get gridY(): number {
    return Math.round(this.y);
  }

  isFree(): boolean {
    return this.occupiedBy === null;
  }

  update(simMinutes: number, lot: Lot): void {
    if (this.occupiedBy) return; // held still while being petted
    if (this.state === "walking") {
      this.stepWalk(simMinutes, lot);
      return;
    }
    this.idleMinutes += simMinutes;
    if (this.idleMinutes >= this.nextWanderAt) {
      this.idleMinutes = 0;
      this.nextWanderAt = WANDER_INTERVAL_MINUTES * (0.5 + Math.random());
      this.wander(lot);
    }
  }

  private wander(lot: Lot): void {
    const tx = Math.max(0, Math.min(lot.width - 1, this.gridX + Math.round((Math.random() * 2 - 1) * WANDER_RADIUS)));
    const ty = Math.max(0, Math.min(lot.height - 1, this.gridY + Math.round((Math.random() * 2 - 1) * WANDER_RADIUS)));
    const path = findPath({ x: this.gridX, y: this.gridY }, { x: tx, y: ty }, (x1, y1, x2, y2) =>
      lot.canMove(x1, y1, x2, y2),
    );
    if (!path || path.length === 0) return;
    this.path = path;
    this.state = "walking";
  }

  private stepWalk(simMinutes: number, lot: Lot): void {
    let remaining = simMinutes * WALK_SPEED_TILES_PER_MINUTE;
    while (remaining > 0 && this.path.length > 0) {
      const next = this.path[0];
      if (!lot.canMove(this.gridX, this.gridY, next.x, next.y)) {
        // Path became blocked (e.g. a wall was built mid-wander); just stop
        // here and go back to idle rather than replanning — a pet giving up
        // and sniffing around where it stands is a perfectly good look.
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

    if (this.path.length === 0) this.state = "idle";
  }
}
