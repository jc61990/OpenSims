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
 * Finds a walkable path from start to goal on a grid.
 * `isWalkable(x, y)` should return false for blocked tiles / out of bounds.
 * Diagonal moves are only allowed when both orthogonal "corner" tiles are
 * also walkable, so paths never cut through wall corners.
 */
export function findPath(
  start: GridPoint,
  goal: GridPoint,
  isWalkable: (x: number, y: number) => boolean,
  maxIterations = 4000,
): GridPoint[] | null {
  if (!isWalkable(goal.x, goal.y)) return null;
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
      if (!isWalkable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        // Prevent cutting diagonally across a blocked corner.
        if (!isWalkable(current.x + dx, current.y) || !isWalkable(current.x, current.y + dy)) {
          continue;
        }
      }

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
