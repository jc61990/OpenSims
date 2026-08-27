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

function faces(gx: number, gy: number, height: number): BlockFaces {
  const [bn, be, bs, bw] = tileCorners(gx, gy);
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

/** Draws a solid box (two shaded side faces + a top face) and returns its corner points for decoration overlays. */
export function drawBlock(
  g: Graphics,
  gx: number,
  gy: number,
  height: number,
  topColor: number,
  leftColor: number,
  rightColor: number,
): BlockFaces {
  const f = faces(gx, gy, height);
  g.poly([f.bw.x, f.bw.y, f.bs.x, f.bs.y, f.ts.x, f.ts.y, f.tw.x, f.tw.y]).fill(leftColor);
  g.poly([f.bs.x, f.bs.y, f.be.x, f.be.y, f.te.x, f.te.y, f.ts.x, f.ts.y]).fill(rightColor);
  g.poly([f.tn.x, f.tn.y, f.te.x, f.te.y, f.ts.x, f.ts.y, f.tw.x, f.tw.y]).fill(topColor);
  return f;
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
