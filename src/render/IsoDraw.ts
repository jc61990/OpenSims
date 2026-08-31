import type { Graphics } from "pixi.js";
import { gridToScreen, type ScreenPoint } from "../engine/IsoMath.ts";

export function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.max(0, ((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.max(0, ((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.max(0, (color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

export function tileCorners(gx: number, gy: number): [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint] {
  return [
    gridToScreen(gx, gy),
    gridToScreen(gx + 1, gy),
    gridToScreen(gx + 1, gy + 1),
    gridToScreen(gx, gy + 1),
  ];
}

/** The four corner points of a box's base (b*) and raised top (t*) faces. */
export interface BlockFaces {
  bn: ScreenPoint;
  be: ScreenPoint;
  bs: ScreenPoint;
  bw: ScreenPoint;
  tn: ScreenPoint;
  te: ScreenPoint;
  ts: ScreenPoint;
  tw: ScreenPoint;
  center: ScreenPoint;
}

function facesFromCorners(
  corners: [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint],
  height: number,
): BlockFaces {
  const [bn, be, bs, bw] = corners;
  const raise = (p: ScreenPoint) => ({ x: p.x, y: p.y - height });
  const tn = raise(bn);
  const te = raise(be);
  const ts = raise(bs);
  const tw = raise(bw);
  return {
    bn,
    be,
    bs,
    bw,
    tn,
    te,
    ts,
    tw,
    center: { x: (tn.x + te.x + ts.x + tw.x) / 4, y: (tn.y + te.y + ts.y + tw.y) / 4 },
  };
}

/**
 * Draws a solid box (two shaded side faces + a top face) and returns its corner points for
 * decoration overlays. Faces get a cheap soft-lit look — a highlight blob near the top face's
 * "back" corner and a darker contact-shadow band at each side face's base — built from a couple
 * of extra flat, low-alpha fills rather than a real gradient (PixiJS's FillGradient allocates a
 * GPU texture per instance, which would leak badly if recreated every frame like this scene is).
 */
function drawFootprintBlock(
  g: Graphics,
  corners: [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint],
  height: number,
  topColor: number,
  leftColor: number,
  rightColor: number,
  topGlow: boolean,
): BlockFaces {
  const f = facesFromCorners(corners, height);
  const leftPts = [f.bw, f.bs, f.ts, f.tw];
  const rightPts = [f.bs, f.be, f.te, f.ts];
  const topPts = [f.tn, f.te, f.ts, f.tw];

  fillPoly(g, leftPts, leftColor);
  fillPoly(g, rightPts, rightColor);
  fillPoly(g, topPts, topColor);

  // Contact-shadow band along the base of each side face.
  fillPoly(g, [f.bw, f.bs, leftFacePoint(f, 1, 0.22), leftFacePoint(f, 0, 0.22)], 0x000000, 0.16);
  fillPoly(g, [f.bs, f.be, rightFacePoint(f, 1, 0.22), rightFacePoint(f, 0, 0.22)], 0x000000, 0.16);

  // Soft highlight on the top face, offset toward the back (N) corner like an overhead light.
  // Skipped for elongated runs of tiles (e.g. walls), where one per tile reads as a repeating
  // polka-dot pattern rather than a single soft light.
  if (topGlow) {
    const glow = topPoint(f, 0.32, 0.32);
    g.circle(glow.x, glow.y, Math.min(16, Math.max(6, height * 0.3))).fill({ color: 0xffffff, alpha: 0.1 });
  }

  return f;
}

/**
 * Draws a solid box (two shaded side faces + a top face) filling a whole grid
 * tile, and returns its corner points for decoration overlays.
 */
export function drawBlock(
  g: Graphics,
  gx: number,
  gy: number,
  height: number,
  topColor: number,
  leftColor: number,
  rightColor: number,
  topGlow = true,
): BlockFaces {
  return drawFootprintBlock(g, tileCorners(gx, gy), height, topColor, leftColor, rightColor, topGlow);
}

/**
 * Draws a thin wall segment standing on the edge between grid points
 * (ax,ay) and (bx,by) — e.g. (3,7) to (4,7) for the edge along the north
 * side of tile (3,7). Reuses the same box-face geometry as drawBlock, just
 * with a thin rectangular footprint centered on that edge instead of a
 * whole-tile diamond.
 */
export function drawWallSegment(
  g: Graphics,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  height: number,
  topColor: number,
  leftColor: number,
  rightColor: number,
  thickness = 5,
): BlockFaces {
  const a = gridToScreen(ax, ay);
  const b = gridToScreen(bx, by);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * (thickness / 2);
  const py = (dx / len) * (thickness / 2);
  const corners: [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint] = [
    { x: a.x - px, y: a.y - py },
    { x: b.x - px, y: b.y - py },
    { x: b.x + px, y: b.y + py },
    { x: a.x + px, y: a.y + py },
  ];
  return drawFootprintBlock(g, corners, height, topColor, leftColor, rightColor, false);
}

/**
 * Draws a doorway on the edge between (ax,ay) and (bx,by): two short jamb
 * posts at the ends plus a header spanning the full opening near the top,
 * leaving a Sim-height gap open underneath so the frame reads as passable
 * at a glance, unlike a solid drawWallSegment. Reuses the same box-face
 * geometry, just building each piece from a shifted/shortened footprint.
 */
export function drawDoorway(
  g: Graphics,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  height: number,
  topColor: number,
  leftColor: number,
  rightColor: number,
  thickness = 5,
): void {
  const a = gridToScreen(ax, ay);
  const b = gridToScreen(bx, by);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * (thickness / 2);
  const py = (dx / len) * (thickness / 2);

  const segment = (p0: ScreenPoint, p1: ScreenPoint): [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint] => [
    { x: p0.x - px, y: p0.y - py },
    { x: p1.x - px, y: p1.y - py },
    { x: p1.x + px, y: p1.y + py },
    { x: p0.x + px, y: p0.y + py },
  ];

  const jambFrac = 0.22;
  const jambEnd1 = { x: a.x + dx * jambFrac, y: a.y + dy * jambFrac };
  const jambEnd2 = { x: b.x - dx * jambFrac, y: b.y - dy * jambFrac };
  drawFootprintBlock(g, segment(a, jambEnd1), height, topColor, leftColor, rightColor, false);
  drawFootprintBlock(g, segment(jambEnd2, b), height, topColor, leftColor, rightColor, false);

  // Header/lintel: a shortened box lifted to just the top slice of the
  // opening, spanning its full width — nothing is drawn below it.
  const headerHeight = height * 0.22;
  const lift = height - headerHeight;
  const raise = (p: ScreenPoint) => ({ x: p.x, y: p.y - lift });
  drawFootprintBlock(g, segment(raise(a), raise(b)), headerHeight, topColor, leftColor, rightColor, false);
}

/**
 * A small square post centered on grid vertex (gx,gy), used to fill the
 * cosmetic gap where two or more thin wall segments meet at a corner.
 */
export function drawWallPost(
  g: Graphics,
  gx: number,
  gy: number,
  height: number,
  topColor: number,
  leftColor: number,
  rightColor: number,
  size = 3,
): BlockFaces {
  const c = gridToScreen(gx, gy);
  const corners: [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint] = [
    { x: c.x, y: c.y - size },
    { x: c.x + size, y: c.y },
    { x: c.x, y: c.y + size },
    { x: c.x - size, y: c.y },
  ];
  return drawFootprintBlock(g, corners, height, topColor, leftColor, rightColor, false);
}

/** Point at (u,v) across the top face parallelogram: u runs N->E, v runs N->W. */
export function topPoint(f: BlockFaces, u: number, v: number): ScreenPoint {
  return {
    x: f.tn.x + u * (f.te.x - f.tn.x) + v * (f.tw.x - f.tn.x),
    y: f.tn.y + u * (f.te.y - f.tn.y) + v * (f.tw.y - f.tn.y),
  };
}

/** Point at (u,v) across the right (south-east facing) side face: u runs S->E, v runs base->top. */
export function rightFacePoint(f: BlockFaces, u: number, v: number): ScreenPoint {
  const base = {
    x: f.bs.x + u * (f.be.x - f.bs.x),
    y: f.bs.y + u * (f.be.y - f.bs.y),
  };
  const top = {
    x: f.ts.x + u * (f.te.x - f.ts.x),
    y: f.ts.y + u * (f.te.y - f.ts.y),
  };
  return { x: base.x + v * (top.x - base.x), y: base.y + v * (top.y - base.y) };
}

/** Point at (u,v) across the left (south-west facing) side face: u runs W->S, v runs base->top. */
export function leftFacePoint(f: BlockFaces, u: number, v: number): ScreenPoint {
  const base = {
    x: f.bw.x + u * (f.bs.x - f.bw.x),
    y: f.bw.y + u * (f.bs.y - f.bw.y),
  };
  const top = {
    x: f.tw.x + u * (f.ts.x - f.tw.x),
    y: f.tw.y + u * (f.ts.y - f.tw.y),
  };
  return { x: base.x + v * (top.x - base.x), y: base.y + v * (top.y - base.y) };
}

export function polyPoints(points: ScreenPoint[]): number[] {
  const out: number[] = [];
  for (const p of points) {
    out.push(p.x, p.y);
  }
  return out;
}

export function fillPoly(g: Graphics, points: ScreenPoint[], color: number, alpha = 1): void {
  g.poly(polyPoints(points)).fill({ color, alpha });
}

export function strokeLine(
  g: Graphics,
  a: ScreenPoint,
  b: ScreenPoint,
  color: number,
  width = 1.5,
  alpha = 1,
): void {
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width, color, alpha });
}

export function fillDot(g: Graphics, p: ScreenPoint, radius: number, color: number, alpha = 1): void {
  g.circle(p.x, p.y, radius).fill({ color, alpha });
}
