import type { GameObject } from "./GameObject.ts";

export const DEFAULT_FLOOR_COLOR = 0x3c4a5c;

export interface Tile {
  floor: number;
}

/** A diagonal wall's orientation across its tile: the grid-vertex pair it spans. */
export type Diagonal = "none" | "nwse" | "nesw";

/**
 * A lot grid with true Sims-style edge walls: a wall lives on the boundary
 * between two tiles rather than filling a tile, so every tile is real usable
 * floor and doorway gaps are exact single points rather than a whole missing
 * wall tile.
 *
 * Walls are stored on two edge grids:
 *  - vWalls[x][y] (x: 0..width, y: 0..height-1) — the vertical edge between
 *    tile column x-1 and column x, at row y. x=0 is the lot's west boundary,
 *    x=width is the east boundary.
 *  - hWalls[x][y] (x: 0..width-1, y: 0..height) — the horizontal edge
 *    between tile row y-1 and row y, at column x. y=0 is the north boundary,
 *    y=height is the south boundary.
 */
export class Lot {
  readonly width: number;
  readonly height: number;
  private tiles: Tile[];
  private vWalls: boolean[];
  private hWalls: boolean[];
  // Doors: a distinct edge state from a plain wall-less gap. Both are
  // passable, but a door still counts as a room boundary for getRoomTiles —
  // matching Sims-style room membership, where each side of a doorway is
  // its own room, instead of the plain-gap case where a missing wall just
  // merges two regions into one. Only meaningful where the corresponding
  // vWalls/hWalls entry is false; see hasDoorBetween.
  private vDoors: boolean[];
  private hDoors: boolean[];
  // Diagonal walls: a simplification of the real Sims-style diagonal wall,
  // which only cuts off a triangular corner of a tile while leaving the rest
  // walkable. This model doesn't have sub-tile walkability, so a diagonal
  // wall here consumes its whole tile instead (see isWalkableTile) — an
  // honest trade for not needing a second walkability model just for this.
  private diagonals: Diagonal[];
  readonly objects: GameObject[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.tiles = new Array(width * height).fill(null).map(() => ({ floor: DEFAULT_FLOOR_COLOR }));
    this.vWalls = new Array((width + 1) * height).fill(false);
    this.hWalls = new Array(width * (height + 1)).fill(false);
    this.vDoors = new Array((width + 1) * height).fill(false);
    this.hDoors = new Array(width * (height + 1)).fill(false);
    this.diagonals = new Array(width * height).fill("none");
    this.buildPerimeterWalls();
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  private buildPerimeterWalls(): void {
    for (let y = 0; y < this.height; y++) {
      this.setVWall(0, y, true);
      this.setVWall(this.width, y, true);
    }
    for (let x = 0; x < this.width; x++) {
      this.setHWall(x, 0, true);
      this.setHWall(x, this.height, true);
    }
    // Leave a doorway gap on the south wall.
    const doorX = Math.floor(this.width / 2);
    this.setHWall(doorX, this.height, false);
  }

  getTile(x: number, y: number): Tile | null {
    if (!this.inBounds(x, y)) return null;
    return this.tiles[this.index(x, y)];
  }

  // --- Walls ---

  /** The vertical edge at boundary column `x` (between tile columns x-1 and x), row `y`. */
  getVWall(x: number, y: number): boolean {
    if (x < 0 || x > this.width || y < 0 || y >= this.height) return false;
    return this.vWalls[y * (this.width + 1) + x];
  }

  setVWall(x: number, y: number, wall: boolean): void {
    if (x < 0 || x > this.width || y < 0 || y >= this.height) return;
    this.vWalls[y * (this.width + 1) + x] = wall;
  }

  /** The horizontal edge at boundary row `y` (between tile rows y-1 and y), column `x`. */
  getHWall(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y > this.height) return false;
    return this.hWalls[y * this.width + x];
  }

  setHWall(x: number, y: number, wall: boolean): void {
    if (x < 0 || x >= this.width || y < 0 || y > this.height) return;
    this.hWalls[y * this.width + x] = wall;
  }

  /** Whether there's a wall on the shared edge between two orthogonally adjacent tiles. */
  hasWallBetween(x1: number, y1: number, x2: number, y2: number): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 1 && dy === 0) return this.getVWall(x1 + 1, y1);
    if (dx === -1 && dy === 0) return this.getVWall(x1, y1);
    if (dx === 0 && dy === 1) return this.getHWall(x1, y1 + 1);
    if (dx === 0 && dy === -1) return this.getHWall(x1, y1);
    return true; // not orthogonally adjacent
  }

  // --- Doors ---

  /** The vertical edge at boundary column `x` (between tile columns x-1 and x), row `y`. */
  getVDoor(x: number, y: number): boolean {
    if (x < 0 || x > this.width || y < 0 || y >= this.height) return false;
    return this.vDoors[y * (this.width + 1) + x];
  }

  setVDoor(x: number, y: number, door: boolean): void {
    if (x < 0 || x > this.width || y < 0 || y >= this.height) return;
    this.vDoors[y * (this.width + 1) + x] = door;
  }

  /** The horizontal edge at boundary row `y` (between tile rows y-1 and y), column `x`. */
  getHDoor(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y > this.height) return false;
    return this.hDoors[y * this.width + x];
  }

  setHDoor(x: number, y: number, door: boolean): void {
    if (x < 0 || x >= this.width || y < 0 || y > this.height) return;
    this.hDoors[y * this.width + x] = door;
  }

  /** Whether there's a door on the shared edge between two orthogonally adjacent tiles. */
  hasDoorBetween(x1: number, y1: number, x2: number, y2: number): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 1 && dy === 0) return this.getVDoor(x1 + 1, y1);
    if (dx === -1 && dy === 0) return this.getVDoor(x1, y1);
    if (dx === 0 && dy === 1) return this.getHDoor(x1, y1 + 1);
    if (dx === 0 && dy === -1) return this.getHDoor(x1, y1);
    return false; // not orthogonally adjacent
  }

  // --- Diagonal walls ---

  getDiagonal(x: number, y: number): Diagonal {
    if (!this.inBounds(x, y)) return "none";
    return this.diagonals[this.index(x, y)];
  }

  setDiagonal(x: number, y: number, diagonal: Diagonal): void {
    if (!this.inBounds(x, y)) return;
    this.diagonals[this.index(x, y)] = diagonal;
  }

  // --- Floors ---

  getFloor(x: number, y: number): number {
    return this.getTile(x, y)?.floor ?? DEFAULT_FLOOR_COLOR;
  }

  setFloor(x: number, y: number, color: number): void {
    if (!this.inBounds(x, y)) return;
    this.tiles[this.index(x, y)].floor = color;
  }

  setFloorRect(x0: number, y0: number, x1: number, y1: number, color: number): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) this.setFloor(x, y, color);
    }
  }

  // --- Objects & walkability ---

  objectAt(x: number, y: number): GameObject | undefined {
    return this.objects.find((o) => o.gridX === x && o.gridY === y);
  }

  /** Whether a Sim could stand on this tile at all (ignoring how they'd get there). */
  isWalkableTile(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    if (this.getDiagonal(x, y) !== "none") return false;
    const obj = this.objectAt(x, y);
    if (obj && !obj.walkable) return false;
    return true;
  }

  /**
   * Whether a Sim can step directly from (x1,y1) to the orthogonally- or
   * diagonally-adjacent tile (x2,y2). Diagonal moves require both straight
   * "legs" to be clear, so paths never cut through a wall corner. (x1,y1)
   * and (x2,y2) being the same tile is trivially true — callers can hit this
   * mid-step, when a Sim's rounded grid position momentarily matches its
   * still-pending path waypoint before that waypoint is formally consumed.
   */
  canMove(x1: number, y1: number, x2: number, y2: number): boolean {
    if (!this.isWalkableTile(x2, y2)) return false;
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return true;
    if (dx !== 0 && dy !== 0) {
      return this.canMove(x1, y1, x2, y1) && this.canMove(x1, y1, x1, y2);
    }
    return !this.hasWallBetween(x1, y1, x2, y2);
  }

  addObject(obj: GameObject): boolean {
    if (!this.inBounds(obj.gridX, obj.gridY)) return false;
    if (this.objectAt(obj.gridX, obj.gridY)) return false;
    this.objects.push(obj);
    return true;
  }

  removeObject(obj: GameObject): void {
    const idx = this.objects.indexOf(obj);
    if (idx >= 0) this.objects.splice(idx, 1);
  }

  /**
   * Flood-fills the connected region containing (x,y): all tiles reachable
   * without crossing a *present* wall or door edge, ignoring furniture/Sims.
   * A door is passable (see hasDoorBetween/canMove) but still bounds a room,
   * matching Sims-style room membership where each side of a doorway is its
   * own room. A plain wall-less gap with no door placed is just open floor,
   * though, and merges the regions on either side of it into one — that's
   * reachability rather than a real room boundary. Used by computeRoomScore.
   */
  getRoomTiles(x: number, y: number): { x: number; y: number }[] {
    if (!this.inBounds(x, y)) return [];
    const seen = new Set<string>();
    const key = (x: number, y: number) => `${x},${y}`;
    const queue: { x: number; y: number }[] = [{ x, y }];
    seen.add(key(x, y));
    const result: { x: number; y: number }[] = [];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      result.push(cur);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (this.hasWallBetween(cur.x, cur.y, nx, ny)) continue;
        if (this.hasDoorBetween(cur.x, cur.y, nx, ny)) continue;
        const k = key(nx, ny);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
    return result;
  }

  /**
   * Scores the environment quality (0-100) of the connected region
   * containing (x,y), from the total decorValue of objects within it. This
   * is what drives the Room motive (game/types.ts) — not a decaying need
   * like the others, but a direct read of a Sim's current surroundings,
   * recomputed fresh every tick rather than accumulated over time.
   */
  computeRoomScore(x: number, y: number): number {
    const tileKeys = new Set(this.getRoomTiles(x, y).map((t) => `${t.x},${t.y}`));
    let totalDecor = 0;
    for (const obj of this.objects) {
      if (tileKeys.has(`${obj.gridX},${obj.gridY}`)) totalDecor += obj.decorValue;
    }
    return Math.max(0, Math.min(100, 10 + totalDecor * 1.2));
  }
}
