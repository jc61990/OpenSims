import type { GameObject } from "./GameObject.ts";

export interface Tile {
  wall: boolean;
}

/**
 * A simplified lot grid. Walls occupy whole tiles (rather than true Sims-style
 * edge walls) to keep pathfinding and rendering straightforward for this MVP.
 */
export class Lot {
  readonly width: number;
  readonly height: number;
  private tiles: Tile[];
  readonly objects: GameObject[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.tiles = new Array(width * height).fill(null).map(() => ({ wall: false }));
    this.buildPerimeterWalls();
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  private buildPerimeterWalls(): void {
    for (let x = 0; x < this.width; x++) {
      this.setWall(x, 0, true);
      this.setWall(x, this.height - 1, true);
    }
    for (let y = 0; y < this.height; y++) {
      this.setWall(0, y, true);
      this.setWall(this.width - 1, y, true);
    }
    // Leave a doorway gap on the south wall.
    const doorX = Math.floor(this.width / 2);
    this.setWall(doorX, this.height - 1, false);
  }

  getTile(x: number, y: number): Tile | null {
    if (!this.inBounds(x, y)) return null;
    return this.tiles[this.index(x, y)];
  }

  hasWall(x: number, y: number): boolean {
    return this.getTile(x, y)?.wall ?? true;
  }

  setWall(x: number, y: number, wall: boolean): void {
    if (!this.inBounds(x, y)) return;
    this.tiles[this.index(x, y)].wall = wall;
  }

  objectAt(x: number, y: number): GameObject | undefined {
    return this.objects.find((o) => o.gridX === x && o.gridY === y);
  }

  isWalkable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    if (this.hasWall(x, y)) return false;
    const obj = this.objectAt(x, y);
    if (obj && !obj.walkable) return false;
    return true;
  }

  addObject(obj: GameObject): boolean {
    if (!this.inBounds(obj.gridX, obj.gridY)) return false;
    if (this.hasWall(obj.gridX, obj.gridY)) return false;
    if (this.objectAt(obj.gridX, obj.gridY)) return false;
    this.objects.push(obj);
    return true;
  }

  removeObject(obj: GameObject): void {
    const idx = this.objects.indexOf(obj);
    if (idx >= 0) this.objects.splice(idx, 1);
  }
}
