import { CanvasSource, Texture } from "pixi.js";

// Small, tileable, mostly-white canvas patterns turned into repeat-wrapped
// PixiJS Textures. Each is built once and cached — generating them is cheap
// but pointless to repeat every frame, same reasoning as the BlurFilter
// IsoRenderer already creates once and reuses.
//
// They're deliberately near-white with only subtle shading: a Graphics fill
// of `{ texture, color }` tints the texture's sampled color by `color`, so
// one grayscale pattern works for every material color in the game (a green
// floor and a purple floor both still read as "floor") instead of needing a
// baked texture per color.

function makeTileTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  draw(ctx);
  const source = new CanvasSource({ resource: canvas, addressMode: "repeat" });
  return new Texture({ source });
}

/** Deterministic, seedable PRNG (mulberry32) — reproducible patterns, no reliance on Math.random. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _floor: Texture | null = null;
/** Subtle speckled grain — works as a generic "flooring" texture regardless of the tile's actual color. */
export function floorTexture(): Texture {
  if (_floor) return _floor;
  const rng = mulberry32(1);
  _floor = makeTileTexture(48, 48, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 48, 48);
    // Faint horizontal grain streaks.
    for (let y = 0; y < 48; y++) {
      const shade = 0.9 + rng() * 0.08;
      ctx.fillStyle = `rgba(0,0,0,${(1 - shade).toFixed(3)})`;
      ctx.fillRect(0, y, 48, 1);
    }
    // Scattered flecks on top, for a woven/grainy feel rather than pure stripes.
    for (let i = 0; i < 70; i++) {
      const x = rng() * 48;
      const y = rng() * 48;
      const r = 0.4 + rng() * 0.6;
      ctx.fillStyle = `rgba(0,0,0,${(0.04 + rng() * 0.05).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return _floor;
}

let _wallPanel: Texture | null = null;
/** Faint vertical grooves, evenly spaced — reads as paneling on a wall's flat faces. */
export function wallPanelTexture(): Texture {
  if (_wallPanel) return _wallPanel;
  _wallPanel = makeTileTexture(24, 48, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 24, 48);
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(0, 0, 1, 48);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(1, 0, 1, 48);
  });
  return _wallPanel;
}

let _fabric: Texture | null = null;
/** Fine crosshatch weave — small enough to read as fabric texture on a Sim's shirt. */
export function fabricTexture(): Texture {
  if (_fabric) return _fabric;
  _fabric = makeTileTexture(8, 8, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 8, 8);
    ctx.fillStyle = "rgba(0,0,0,0.07)";
    ctx.fillRect(0, 0, 8, 1);
    ctx.fillRect(0, 4, 8, 1);
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(0, 0, 1, 8);
    ctx.fillRect(4, 0, 1, 8);
  });
  return _fabric;
}
