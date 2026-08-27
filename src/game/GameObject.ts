import type { MotiveType } from "./types.ts";
import type { Sim } from "./Sim.ts";

export interface Interaction {
  id: string;
  label: string;
  motive: MotiveType;
  /** Motive points gained per sim-minute while using this object. */
  gainPerMinute: number;
  /** How many sim-minutes the interaction runs before auto-completing. */
  durationMinutes: number;
}

export interface GameObjectDef {
  type: string;
  label: string;
  color: number;
  interactions: Interaction[];
  /** Simoleons to place this object in Buy mode. */
  price: number;
  /** Where (relative to the object tile) a sim must stand to use it. */
  standOffset?: { dx: number; dy: number };
  walkable?: boolean;
}

let nextId = 1;

export class GameObject {
  readonly id: number;
  readonly type: string;
  readonly label: string;
  readonly color: number;
  readonly interactions: Interaction[];
  readonly price: number;
  readonly standOffset: { dx: number; dy: number };
  readonly walkable: boolean;
  gridX: number;
  gridY: number;
  occupiedBy: Sim | null = null;

  constructor(def: GameObjectDef, gridX: number, gridY: number) {
    this.id = nextId++;
    this.type = def.type;
    this.label = def.label;
    this.color = def.color;
    this.interactions = def.interactions;
    this.price = def.price;
    this.standOffset = def.standOffset ?? { dx: 0, dy: 1 };
    this.walkable = def.walkable ?? false;
    this.gridX = gridX;
    this.gridY = gridY;
  }

  get standSpot(): { x: number; y: number } {
    return { x: this.gridX + this.standOffset.dx, y: this.gridY + this.standOffset.dy };
  }

  isFree(): boolean {
    return this.occupiedBy === null;
  }
}
