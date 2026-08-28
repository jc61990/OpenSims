// Simple A* grid pathfinder with 8-directional movement.
export interface GridPoint {
  x: number;
  y: number;
}

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: Node | null;
}

const NEIGHBORS = [
  { dx: 1, dy: 0, cost: 1 },
  { dx: -1, dy: 0, cost: 1 },
  { dx: 0, dy: 1, cost: 1 },
  { dx: 0, dy: -1, cost: 1 },
  { dx: 1, dy: 1, cost: Math.SQRT2 },
  { dx: 1, dy: -1, cost: Math.SQRT2 },
  { dx: -1, dy: 1, cost: Math.SQRT2 },
  { dx: -1, dy: -1, cost: Math.SQRT2 },
];

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/**
 * Finds a path from start to goal on a grid.
 * `canMove(x1, y1, x2, y2)` should return whether a single step from
 * (x1,y1) to the adjacent tile (x2,y2) is allowed — false for out-of-bounds,
 * occupied, or wall-blocked moves. It's expected to handle its own diagonal
 * corner-cutting rules (e.g. requiring both straight "legs" to be clear).
 */
export function findPath(
  start: GridPoint,
  goal: GridPoint,
  canMove: (x1: number, y1: number, x2: number, y2: number) => boolean,
  maxIterations = 4000,
): GridPoint[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];

  const open = new Map<string, Node>();
  const closed = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;

  const startNode: Node = {
    x: start.x,
    y: start.y,
    g: 0,
    f: heuristic(start.x, start.y, goal.x, goal.y),
    parent: null,
  };
  open.set(key(start.x, start.y), startNode);

  let iterations = 0;
  while (open.size > 0) {
    if (++iterations > maxIterations) return null;

    let current: Node | null = null;
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node;
    }
    if (!current) break;

    if (current.x === goal.x && current.y === goal.y) {
      const path: GridPoint[] = [];
      let n: Node | null = current;
      while (n && n.parent) {
        path.push({ x: n.x, y: n.y });
        n = n.parent;
      }
      path.reverse();
      return path;
    }

    open.delete(key(current.x, current.y));
    closed.add(key(current.x, current.y));

    for (const { dx, dy, cost } of NEIGHBORS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      if (!canMove(current.x, current.y, nx, ny)) continue;

      const g = current.g + cost;
      const existing = open.get(nk);
      if (!existing || g < existing.g) {
        const node: Node = {
          x: nx,
          y: ny,
          g,
          f: g + heuristic(nx, ny, goal.x, goal.y),
          parent: current,
        };
        open.set(nk, node);
      }
    }
  }

  return null;
}
