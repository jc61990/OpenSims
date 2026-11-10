import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { gridToScreen, screenToGrid, type ScreenPoint } from "../engine/IsoMath.ts";
import { tileCorners, fillPoly, strokeLine, shade } from "./IsoDraw.ts";
import { zoomCameraTo, pointerMidpoint, pointerDistance } from "./Camera.ts";
import { MAP_WIDTH, MAP_HEIGHT, MAP_ROAD_COLUMNS, MAP_ROAD_ROWS, type NeighborhoodMapHouse } from "../game/Neighborhood.ts";

const GRASS_A = 0x5a9a5a;
const GRASS_B = 0x549454;
const ROAD_COLOR = 0x3a3f46;
const WALL_COLOR = 0xe6ddc8;
const HOUSE_HEIGHT = 60;
const ROOF_RISE = 20;

interface Drawable {
  depth: number;
  draw: (g: Graphics) => void;
}

// A straight back-and-forth route along one of the map's roads — purely
// decorative, no interaction with houses or the player, just enough motion
// to make the overview read as a living town rather than a static map.
interface CarRoute {
  orientation: "h" | "v";
  fixed: number; // the road's column (v) or row (h)
  from: number;
  to: number;
  periodMs: number;
  phase: number;
  color: number;
}

const CAR_ROUTES: CarRoute[] = [
  { orientation: "h", fixed: MAP_ROAD_ROWS[0] + 0.5, from: 1.5, to: MAP_WIDTH - 1.5, periodMs: 9000, phase: 0, color: 0xd65a4a },
  { orientation: "h", fixed: MAP_ROAD_ROWS[0] + 0.5, from: 1.5, to: MAP_WIDTH - 1.5, periodMs: 11000, phase: 0.5, color: 0xe0c050 },
  { orientation: "v", fixed: MAP_ROAD_COLUMNS[0] + 0.5, from: 1.5, to: MAP_HEIGHT - 1.5, periodMs: 8000, phase: 0.2, color: 0x4a90d6 },
  { orientation: "v", fixed: MAP_ROAD_COLUMNS[1] + 0.5, from: 1.5, to: MAP_HEIGHT - 1.5, periodMs: 10000, phase: 0.7, color: 0x6ac27a },
];

export interface NeighborhoodRendererCallbacks {
  onEnterHouse: (houseId: string) => void;
}

/**
 * The neighborhood overview: a separate, much bigger isometric scene (its
 * own PixiJS Application, created once and just shown/hidden rather than
 * torn down between visits) showing every house as a small building on a
 * grid of streets, scrollable and zoomable the same way the in-house view
 * is. Deliberately much simpler than IsoRenderer — no Sims, no walls, no
 * build modes — just a static ground layer (grass/roads/houses, drawn once)
 * plus a handful of cars animated back and forth along the roads.
 */
export class NeighborhoodRenderer {
  app!: Application;
  private world!: Container;
  private groundGfx!: Graphics;
  private carsGfx!: Graphics;
  private labelsLayer!: Container;
  private houses: NeighborhoodMapHouse[] = [];
  private callbacks: NeighborhoodRendererCallbacks = { onEnterHouse: () => {} };

  private dragging = false;
  private dragMoved = false;
  private lastPointer = { x: 0, y: 0 };
  private activePointers = new Map<number, ScreenPoint>();
  private pinchStartDistance = 0;
  private pinchStartScale = 1;

  async init(holder: HTMLElement, houses: NeighborhoodMapHouse[], callbacks: NeighborhoodRendererCallbacks): Promise<void> {
    this.houses = houses;
    this.callbacks = callbacks;

    this.app = new Application();
    await this.app.init({
      resizeTo: holder,
      antialias: true,
      background: 0x8fc0dc,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    holder.appendChild(this.app.canvas);

    this.world = new Container();
    const initialScale = 0.8;
    const center = gridToScreen(MAP_WIDTH / 2, MAP_HEIGHT / 2);
    this.world.scale.set(initialScale);
    this.world.position.set(
      this.app.renderer.width / 2 - center.x * initialScale,
      this.app.renderer.height / 2 - center.y * initialScale,
    );
    this.app.stage.addChild(this.world);

    this.groundGfx = new Graphics();
    this.world.addChild(this.groundGfx);
    this.carsGfx = new Graphics();
    this.world.addChild(this.carsGfx);
    this.labelsLayer = new Container();
    this.world.addChild(this.labelsLayer);

    this.drawGround();
    this.buildLabels();
    this.setupPointerHandlers();
    this.app.ticker.add(() => this.renderCars());
  }

  /**
   * PixiJS's `resizeTo` only re-measures on the browser's own `resize`
   * event, so a canvas initialized while its holder was `display:none`
   * (true for this one — it starts hidden and only appears once the player
   * opens the map) stays sized at whatever near-zero size it saw at init.
   * main.ts calls this right after making the holder visible again.
   */
  resize(): void {
    this.app.queueResize();
  }

  private drawGround(): void {
    const g = this.groundGfx;
    const isRoad = (x: number, y: number) => MAP_ROAD_COLUMNS.includes(x) || MAP_ROAD_ROWS.includes(y);
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const color = isRoad(x, y) ? ROAD_COLOR : (x + y) % 2 === 0 ? GRASS_A : GRASS_B;
        fillPoly(g, tileCorners(x, y), color);
      }
    }
    for (const col of MAP_ROAD_COLUMNS) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        if (y % 2 === 0) continue;
        strokeLine(g, gridToScreen(col + 0.5, y), gridToScreen(col + 0.5, y + 1), 0xffffff, 1.5, 0.5);
      }
    }
    for (const row of MAP_ROAD_ROWS) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (x % 2 === 0) continue;
        strokeLine(g, gridToScreen(x, row + 0.5), gridToScreen(x + 1, row + 0.5), 0xffffff, 1.5, 0.5);
      }
    }
    for (const house of this.houses) this.drawHouse(g, house);
  }

  /** A simple gable-roofed box spanning the house's whole footprint (not a per-tile block, so it reads as one building rather than a quilt of cubes). */
  private drawHouse(g: Graphics, house: NeighborhoodMapHouse): void {
    const size = house.footprint;
    const bn = gridToScreen(house.gx, house.gy);
    const be = gridToScreen(house.gx + size, house.gy);
    const bs = gridToScreen(house.gx + size, house.gy + size);
    const bw = gridToScreen(house.gx, house.gy + size);
    const raise = (p: ScreenPoint, h: number) => ({ x: p.x, y: p.y - h });
    const tn = raise(bn, HOUSE_HEIGHT);
    const te = raise(be, HOUSE_HEIGHT);
    const ts = raise(bs, HOUSE_HEIGHT);
    const tw = raise(bw, HOUSE_HEIGHT);

    fillPoly(g, [bw, bs, ts, tw], shade(WALL_COLOR, 0.68));
    fillPoly(g, [bs, be, te, ts], shade(WALL_COLOR, 0.5));
    fillPoly(g, [tn, te, ts, tw], shade(WALL_COLOR, 1.0));

    const ridgeN = raise(bn, HOUSE_HEIGHT + ROOF_RISE);
    const ridgeS = raise(bs, HOUSE_HEIGHT + ROOF_RISE);
    fillPoly(g, [tn, te, ridgeS, ridgeN], shade(house.roofColor, 0.82));
    fillPoly(g, [tn, tw, ridgeS, ridgeN], shade(house.roofColor, 1.05));

    // Contact shadow so the building doesn't look like it's floating over the yard.
    const shadowPts = [bw, bs, be, bn].map((p) => ({ x: p.x, y: p.y + 2 }));
    fillPoly(g, shadowPts, 0x000000, 0.18);
  }

  private buildLabels(): void {
    for (const house of this.houses) {
      const top = gridToScreen(house.gx + house.footprint / 2, house.gy);
      const label = new Text({
        text: house.name,
        style: new TextStyle({ fill: 0xffffff, fontSize: 13, fontWeight: "700", stroke: { color: 0x000000, width: 3 } }),
      });
      label.anchor.set(0.5, 1);
      label.position.set(top.x, top.y - HOUSE_HEIGHT - ROOF_RISE - 6);
      this.labelsLayer.addChild(label);
    }
  }

  private renderCars(): void {
    const now = performance.now();
    this.carsGfx.clear();
    const items: Drawable[] = [];
    for (const route of CAR_ROUTES) {
      const cycle = (now / route.periodMs + route.phase) % 1;
      const tri = cycle < 0.5 ? cycle * 2 : 2 - cycle * 2;
      const t = route.from + tri * (route.to - route.from);
      const gx = route.orientation === "h" ? t : route.fixed;
      const gy = route.orientation === "h" ? route.fixed : t;
      items.push({ depth: gx + gy, draw: (g) => this.drawCar(g, gx, gy, route.orientation, route.color) });
    }
    items.sort((a, b) => a.depth - b.depth);
    for (const item of items) item.draw(this.carsGfx);
  }

  private drawCar(g: Graphics, gx: number, gy: number, orientation: "h" | "v", color: number): void {
    const len = 0.46;
    const wid = 0.24;
    const corners =
      orientation === "h"
        ? [
            gridToScreen(gx - len, gy - wid),
            gridToScreen(gx + len, gy - wid),
            gridToScreen(gx + len, gy + wid),
            gridToScreen(gx - len, gy + wid),
          ]
        : [
            gridToScreen(gx - wid, gy - len),
            gridToScreen(gx + wid, gy - len),
            gridToScreen(gx + wid, gy + len),
            gridToScreen(gx - wid, gy + len),
          ];
    fillPoly(g, corners, color);
    const center = gridToScreen(gx, gy);
    g.circle(center.x, center.y, 3.5).fill({ color: shade(color, 0.6), alpha: 0.85 });
  }

  private resolveHouseAt(worldX: number, worldY: number): NeighborhoodMapHouse | null {
    const gp = screenToGrid(worldX, worldY);
    for (const house of this.houses) {
      if (gp.x >= house.gx && gp.x < house.gx + house.footprint && gp.y >= house.gy && gp.y < house.gy + house.footprint) {
        return house;
      }
    }
    return null;
  }

  private setupPointerHandlers(): void {
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.cursor = "grab";
    canvas.style.touchAction = "none";

    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Harmless if it fails for a synthetic/edge-case pointer — see IsoRenderer's identical guard.
      }
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.activePointers.size === 1) {
        this.dragging = true;
        this.dragMoved = false;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = "grabbing";
      } else if (this.activePointers.size === 2) {
        this.dragging = false;
        this.dragMoved = true;
        this.beginPinch();
      }
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!this.activePointers.has(e.pointerId)) return;
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.activePointers.size >= 2) {
        this.stepPinch();
        return;
      }
      if (!this.dragging) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.dragMoved = true;
      this.world.x += dx;
      this.world.y += dy;
      this.lastPointer = { x: e.clientX, y: e.clientY };
    });

    const endPointer = (e: PointerEvent) => {
      if (!this.activePointers.has(e.pointerId)) return;
      this.activePointers.delete(e.pointerId);

      if (this.activePointers.size === 0) {
        const wasDragging = this.dragging;
        this.dragging = false;
        this.pinchStartDistance = 0;
        canvas.style.cursor = "grab";
        if (wasDragging && !this.dragMoved) this.handleClick(e);
      } else if (this.activePointers.size === 1) {
        this.pinchStartDistance = 0;
        const [remaining] = this.activePointers.values();
        this.dragging = true;
        this.dragMoved = true;
        this.lastPointer = remaining;
      }
    };
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const next = zoomCameraTo(
          { x: this.world.x, y: this.world.y, scale: this.world.scale.x },
          e.clientX - rect.left,
          e.clientY - rect.top,
          this.world.scale.x * factor,
        );
        this.world.scale.set(next.scale);
        this.world.x = next.x;
        this.world.y = next.y;
      },
      { passive: false },
    );
  }

  private beginPinch(): void {
    const pts = [...this.activePointers.values()];
    this.pinchStartDistance = pointerDistance(pts[0], pts[1]);
    this.pinchStartScale = this.world.scale.x;
  }

  private stepPinch(): void {
    if (this.pinchStartDistance <= 0) {
      this.beginPinch();
      return;
    }
    const pts = [...this.activePointers.values()];
    const dist = pointerDistance(pts[0], pts[1]);
    const rect = (this.app.canvas as HTMLCanvasElement).getBoundingClientRect();
    const mid = pointerMidpoint(pts);
    const next = zoomCameraTo(
      { x: this.world.x, y: this.world.y, scale: this.world.scale.x },
      mid.x - rect.left,
      mid.y - rect.top,
      this.pinchStartScale * (dist / this.pinchStartDistance),
    );
    this.world.scale.set(next.scale);
    this.world.x = next.x;
    this.world.y = next.y;
  }

  private handleClick(e: PointerEvent): void {
    const canvas = this.app.canvas as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const worldX = (px - this.world.x) / this.world.scale.x;
    const worldY = (py - this.world.y) / this.world.scale.y;
    const house = this.resolveHouseAt(worldX, worldY);
    if (house) this.callbacks.onEnterHouse(house.id);
  }
}
