// Isometric grid <-> screen coordinate conversion (2:1 diamond projection).
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

export interface ScreenPoint {
  x: number;
  y: number;
}

export function gridToScreen(gx: number, gy: number): ScreenPoint {
  return {
    x: (gx - gy) * (TILE_WIDTH / 2),
    y: (gx + gy) * (TILE_HEIGHT / 2),
  };
}

export function screenToGrid(sx: number, sy: number): ScreenPoint {
  const gx = sy / TILE_HEIGHT + sx / TILE_WIDTH;
  const gy = sy / TILE_HEIGHT - sx / TILE_WIDTH;
  return { x: gx, y: gy };
}

// Draw order: tiles further "south-east" (higher gx+gy) must be drawn later
// so they overlap tiles behind them.
export function depthOf(gx: number, gy: number): number {
  return gx + gy;
}
