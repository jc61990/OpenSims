import type { Graphics } from "pixi.js";
import type { GameObject } from "../game/GameObject.ts";
import {
  drawBlock,
  topPoint,
  rightFacePoint,
  leftFacePoint,
  fillPoly,
  strokeLine,
  fillDot,
  shade,
  type BlockFaces,
} from "./IsoDraw.ts";

type Drawer = (g: Graphics, gx: number, gy: number, color: number) => void;

const METAL = 0xe8edf0;
const DARK = 0x241d16;

function drawShelfLines(f: BlockFaces, g: Graphics, color: number, rows: number[]): void {
  for (const v of rows) {
    strokeLine(g, rightFacePoint(f, 0.04, v), rightFacePoint(f, 0.96, v), color, 1.2, 0.7);
    strokeLine(g, leftFacePoint(f, 0.04, v), leftFacePoint(f, 0.96, v), color, 1.2, 0.7);
  }
}

const fridge: Drawer = (g, gx, gy, color) => {
  const f = drawBlock(g, gx, gy, 34, shade(color, 1.05), shade(color, 0.72), shade(color, 0.52));
  strokeLine(g, rightFacePoint(f, 0.02, 0.58), rightFacePoint(f, 0.98, 0.58), shade(color, 0.35), 1.4, 0.8);
  fillPoly(
    g,
    [
      rightFacePoint(f, 0.14, 0.32),
      rightFacePoint(f, 0.2, 0.32),
      rightFacePoint(f, 0.2, 0.5),
      rightFacePoint(f, 0.14, 0.5),
    ],
    METAL,
  );
  fillPoly(
    g,
    [
      rightFacePoint(f, 0.14, 0.66),
      rightFacePoint(f, 0.2, 0.66),
      rightFacePoint(f, 0.2, 0.9),
      rightFacePoint(f, 0.14, 0.9),
    ],
    METAL,
  );
};

const bed: Drawer = (g, gx, gy, color) => {
  const frame = 0x5a4632;
  const f = drawBlock(g, gx, gy, 16, shade(color, 1.0), shade(frame, 0.8), shade(frame, 0.55));
  fillPoly(
    g,
    [topPoint(f, 0.1, 0.15), topPoint(f, 0.38, 0.15), topPoint(f, 0.38, 0.85), topPoint(f, 0.1, 0.85)],
    0xf3f1e8,
  );
  strokeLine(g, topPoint(f, 0.52, 0.08), topPoint(f, 0.52, 0.92), shade(color, 0.7), 2, 0.55);
};

const shower: Drawer = (g, gx, gy, color) => {
  const f = drawBlock(g, gx, gy, 42, shade(color, 1.05), shade(color, 0.7), shade(color, 0.5));
  for (const u of [0.25, 0.5, 0.75]) {
    strokeLine(g, rightFacePoint(f, u, 0.06), rightFacePoint(f, u, 0.94), shade(color, 0.6), 1, 0.5);
    strokeLine(g, leftFacePoint(f, u, 0.06), leftFacePoint(f, u, 0.94), shade(color, 0.6), 1, 0.5);
  }
  fillDot(g, rightFacePoint(f, 0.5, 0.88), 3.5, METAL);
  strokeLine(g, rightFacePoint(f, 0.5, 0.85), rightFacePoint(f, 0.5, 0.55), METAL, 2, 0.8);
};

const toilet: Drawer = (g, gx, gy, color) => {
  const f = drawBlock(g, gx, gy, 18, shade(color, 1.02), shade(color, 0.72), shade(color, 0.5));
  fillPoly(
    g,
    [topPoint(f, 0.28, 0.28), topPoint(f, 0.72, 0.28), topPoint(f, 0.72, 0.72), topPoint(f, 0.28, 0.72)],
    0xf0f4f5,
  );
  fillPoly(
    g,
    [topPoint(f, 0.3, 0.02), topPoint(f, 0.7, 0.02), topPoint(f, 0.7, 0.22), topPoint(f, 0.3, 0.22)],
    shade(color, 0.85),
  );
};

const tv: Drawer = (g, gx, gy, color) => {
  const f = drawBlock(g, gx, gy, 30, shade(color, 1.1), shade(color, 0.7), shade(color, 0.45));
  fillPoly(
    g,
    [
      rightFacePoint(f, 0.08, 0.18),
      rightFacePoint(f, 0.92, 0.18),
      rightFacePoint(f, 0.92, 0.82),
      rightFacePoint(f, 0.08, 0.82),
    ],
    0x1a2a44,
  );
  fillPoly(
    g,
    [
      rightFacePoint(f, 0.14, 0.3),
      rightFacePoint(f, 0.5, 0.3),
      rightFacePoint(f, 0.5, 0.5),
      rightFacePoint(f, 0.14, 0.5),
    ],
    0x33507a,
    0.7,
  );
  strokeLine(g, rightFacePoint(f, 0.5, 0), rightFacePoint(f, 0.5, 0.15), shade(color, 0.6), 3, 0.9);
};

const stereo: Drawer = (g, gx, gy, color) => {
  const f = drawBlock(g, gx, gy, 26, shade(color, 1.05), shade(color, 0.7), shade(color, 0.48));
  fillDot(g, rightFacePoint(f, 0.28, 0.5), 5, DARK);
  fillDot(g, rightFacePoint(f, 0.28, 0.5), 2.4, shade(color, 1.3));
  fillDot(g, rightFacePoint(f, 0.72, 0.5), 5, DARK);
  fillDot(g, rightFacePoint(f, 0.72, 0.5), 2.4, shade(color, 1.3));
  strokeLine(g, rightFacePoint(f, 0.1, 0.85), rightFacePoint(f, 0.9, 0.85), DARK, 2, 0.6);
};

const bookshelf: Drawer = (g, gx, gy, color) => {
  const f = drawBlock(g, gx, gy, 40, shade(color, 1.05), shade(color, 0.68), shade(color, 0.46));
  drawShelfLines(f, g, shade(color, 0.4), [0.3, 0.55, 0.8]);
  const spineColors = [0xc9524a, 0x4a8ac9, 0xd6b04a, 0x5ab06a, 0x9a6ac2];
  let i = 0;
  for (const v0 of [0.32, 0.57, 0.82]) {
    for (let u = 0.1; u < 0.9; u += 0.14) {
      fillPoly(
        g,
        [
          rightFacePoint(f, u, v0),
          rightFacePoint(f, u + 0.09, v0),
          rightFacePoint(f, u + 0.09, v0 + 0.2),
          rightFacePoint(f, u, v0 + 0.2),
        ],
        spineColors[i % spineColors.length],
        0.85,
      );
      i++;
    }
  }
};

const sofa: Drawer = (g, gx, gy, color) => {
  const f = drawBlock(g, gx, gy, 18, shade(color, 1.0), shade(color, 0.68), shade(color, 0.48));
  const backA = topPoint(f, 0.02, 0.02);
  const backB = topPoint(f, 0.98, 0.02);
  const raise = 16;
  fillPoly(
    g,
    [
      { x: backA.x, y: backA.y },
      { x: backB.x, y: backB.y },
      { x: backB.x, y: backB.y - raise },
      { x: backA.x, y: backA.y - raise },
    ],
    shade(color, 0.85),
  );
  strokeLine(g, topPoint(f, 0.5, 0.15), topPoint(f, 0.5, 0.95), shade(color, 0.6), 2, 0.5);
};

const sink: Drawer = (g, gx, gy, color) => {
  const f = drawBlock(g, gx, gy, 20, shade(color, 1.05), shade(color, 0.72), shade(color, 0.5));
  const c = topPoint(f, 0.5, 0.5);
  g.ellipse(c.x, c.y, 13, 7).fill(0xf3f6f7);
  strokeLine(g, topPoint(f, 0.5, 0.1), c, METAL, 2, 0.8);
  fillDot(g, topPoint(f, 0.5, 0.1), 2, METAL);
};

const dresser: Drawer = (g, gx, gy, color) => {
  const f = drawBlock(g, gx, gy, 26, shade(color, 1.02), shade(color, 0.68), shade(color, 0.46));
  drawShelfLines(f, g, shade(color, 0.35), [0.32, 0.6, 0.88]);
  for (const v of [0.2, 0.48, 0.76]) {
    fillDot(g, rightFacePoint(f, 0.5, v), 1.8, METAL, 0.9);
  }
};

const counter: Drawer = (g, gx, gy, color) => {
  const f = drawBlock(g, gx, gy, 24, shade(color, 1.1), shade(color, 0.7), shade(color, 0.5));
  fillPoly(
    g,
    [topPoint(f, 0, 0), topPoint(f, 1, 0), topPoint(f, 1, 0.18), topPoint(f, 0, 0.18)],
    shade(color, 1.25),
  );
};

const plant: Drawer = (g, gx, gy) => {
  const potColor = 0x6b4530;
  const f = drawBlock(g, gx, gy, 12, shade(potColor, 1.1), shade(potColor, 0.7), shade(potColor, 0.5));
  const base = topPoint(f, 0.5, 0.5);
  const leaf = 0x4a8a4a;
  fillDot(g, { x: base.x, y: base.y - 8 }, 9, shade(leaf, 0.85));
  fillDot(g, { x: base.x - 8, y: base.y - 4 }, 7, leaf);
  fillDot(g, { x: base.x + 8, y: base.y - 4 }, 7, shade(leaf, 1.15));
  fillDot(g, { x: base.x, y: base.y - 16 }, 6, shade(leaf, 1.1));
};

const painting: Drawer = (g, gx, gy, color) => {
  const f = drawBlock(g, gx, gy, 28, shade(0x8a6a3a, 1.0), shade(0x8a6a3a, 0.65), shade(0x8a6a3a, 0.4));
  fillPoly(
    g,
    [
      rightFacePoint(f, 0.18, 0.2),
      rightFacePoint(f, 0.82, 0.2),
      rightFacePoint(f, 0.82, 0.85),
      rightFacePoint(f, 0.18, 0.85),
    ],
    0xd6c9a8,
  );
  fillPoly(
    g,
    [
      rightFacePoint(f, 0.25, 0.55),
      rightFacePoint(f, 0.5, 0.3),
      rightFacePoint(f, 0.75, 0.55),
      rightFacePoint(f, 0.5, 0.78),
    ],
    color,
    0.85,
  );
};

const DRAWERS: Record<string, Drawer> = {
  fridge,
  bed,
  shower,
  toilet,
  tv,
  stereo,
  bookshelf,
  sofa,
  sink,
  dresser,
  counter,
  plant,
  painting,
};

const DEFAULT_HEIGHT = 22;

export function drawObject(g: Graphics, obj: GameObject): void {
  const drawer = DRAWERS[obj.type];
  if (drawer) {
    drawer(g, obj.gridX, obj.gridY, obj.color);
  } else {
    drawBlock(
      g,
      obj.gridX,
      obj.gridY,
      DEFAULT_HEIGHT,
      obj.color,
      shade(obj.color, 0.75),
      shade(obj.color, 0.55),
    );
  }
}
