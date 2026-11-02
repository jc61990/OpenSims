import { Application, BlurFilter, Container, Graphics, Text, TextStyle } from "pixi.js";
import { gridToScreen, screenToGrid } from "../engine/IsoMath.ts";
import { tileCorners, drawWallSegment, drawWallPost, drawDoorway, shade } from "./IsoDraw.ts";
import { drawObject } from "./ObjectArt.ts";
import type { Lot } from "../game/Lot.ts";
import type { Sim } from "../game/Sim.ts";
import type { Pet } from "../game/Pet.ts";

const WALL_HEIGHT = 48;
const FLOOR_LINE = 0x0e1420;
const WALL_TOP = 0xdedad0;
const WALL_LEFT = 0xb4b0a6;
const WALL_RIGHT = 0x94908a;

interface Drawable {
  depth: number;
  draw: (g: Graphics) => void;
}

export interface RendererCallbacks {
  /** fracX/fracY are the click's position within the tile (0-1 each), for edge-targeting in Build mode. */
  onTileClick?: (gx: number, gy: number, fracX: number, fracY: number) => void;
  onSimClick?: (simId: number) => void;
}

export class IsoRenderer {
  app!: Application;
  world!: Container;
  private floorGfx!: Graphics;
  private shadowLayer!: Container;
  private shadowGfx!: Graphics;
  private scene!: Graphics;
  private labelsLayer!: Container;
  private simLabels = new Map<number, Text>();
  private petLabels = new Map<number, Text>();
  private lot!: Lot;
  private getSims!: () => Sim[];
  private getPets: () => Pet[] = () => [];
  private callbacks: RendererCallbacks = {};
  selectedSimId: number | null = null;

  private dragging = false;
  private dragMoved = false;
  private lastPointer = { x: 0, y: 0 };

  async init(holder: HTMLElement, lot: Lot, getSims: () => Sim[], getPets: () => Pet[], callbacks: RendererCallbacks) {
    this.lot = lot;
    this.getSims = getSims;
    this.getPets = getPets;
    this.callbacks = callbacks;

    this.app = new Application();
    await this.app.init({
      resizeTo: holder,
      antialias: true,
      background: 0x0b0f1a,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    holder.appendChild(this.app.canvas);

    this.world = new Container();
    this.world.position.set(this.app.renderer.width / 2, 140);
    this.app.stage.addChild(this.world);

    this.floorGfx = new Graphics();
    this.world.addChild(this.floorGfx);

    // A dedicated blurred layer for soft ambient shadows, kept separate from
    // `scene` since a filter blurs everything on its container — walls,
    // objects, and Sims must stay crisp. The filter is created once here and
    // reused every frame; only its contents (shadowGfx) get cleared/redrawn.
    this.shadowLayer = new Container();
    this.shadowLayer.filters = [new BlurFilter({ strength: 4, quality: 2 })];
    this.shadowGfx = new Graphics();
    this.shadowLayer.addChild(this.shadowGfx);
    this.world.addChild(this.shadowLayer);

    this.scene = new Graphics();
    this.world.addChild(this.scene);

    this.labelsLayer = new Container();
    this.world.addChild(this.labelsLayer);

    this.setupPointerHandlers();
    this.app.ticker.add(() => this.render());
  }

  private setupPointerHandlers(): void {
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.cursor = "grab";

    canvas.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.dragMoved = false;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.dragMoved = true;
      this.world.x += dx;
      this.world.y += dy;
      this.lastPointer = { x: e.clientX, y: e.clientY };
    });

    const endDrag = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      canvas.style.cursor = "grab";
      if (!this.dragMoved) this.handleClick(e);
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const worldXBefore = (px - this.world.x) / this.world.scale.x;
        const worldYBefore = (py - this.world.y) / this.world.scale.y;

        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(2.2, Math.max(0.5, this.world.scale.x * factor));
        this.world.scale.set(newScale);

        this.world.x = px - worldXBefore * newScale;
        this.world.y = py - worldYBefore * newScale;
      },
      { passive: false },
    );
  }

  private handleClick(e: PointerEvent): void {
    const canvas = this.app.canvas as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const worldX = (px - this.world.x) / this.world.scale.x;
    const worldY = (py - this.world.y) / this.world.scale.y;

    // Sim hit-test first (small radius around each sim's screen position).
    // Sims at work aren't on the lot, so they're not clickable either.
    for (const sim of this.getSims()) {
      if (sim.state === "atWork") continue;
      const p = gridToScreen(sim.x + 0.5, sim.y + 0.5);
      const d = Math.hypot(p.x - worldX, p.y - worldY);
      if (d < 18) {
        this.callbacks.onSimClick?.(sim.id);
        return;
      }
    }

    const gp = screenToGrid(worldX, worldY);
    const gx = Math.floor(gp.x);
    const gy = Math.floor(gp.y);
    this.callbacks.onTileClick?.(gx, gy, gp.x - gx, gp.y - gy);
  }

  private render(): void {
    const now = performance.now();
    this.floorGfx.clear();
    this.drawFloors();

    // Sims at work are away from the lot for their shift, so they're hidden
    // from every visual layer (shadow, scene, and name label) below.
    const sims = this.getSims().filter((s) => s.state !== "atWork");
    const pets = this.getPets();
    this.shadowGfx.clear();
    this.drawShadows(sims, pets);

    this.scene.clear();
    const items: Drawable[] = [];

    for (let y = 0; y < this.lot.height; y++) {
      for (let x = 0; x <= this.lot.width; x++) {
        if (this.lot.getVWall(x, y)) {
          items.push({
            depth: x + y + 0.5,
            draw: (g) => drawWallSegment(g, x, y, x, y + 1, WALL_HEIGHT, WALL_TOP, WALL_LEFT, WALL_RIGHT),
          });
        } else if (this.lot.getVDoor(x, y)) {
          items.push({
            depth: x + y + 0.5,
            draw: (g) => drawDoorway(g, x, y, x, y + 1, WALL_HEIGHT, WALL_TOP, WALL_LEFT, WALL_RIGHT),
          });
        }
      }
    }
    for (let y = 0; y <= this.lot.height; y++) {
      for (let x = 0; x < this.lot.width; x++) {
        if (this.lot.getHWall(x, y)) {
          items.push({
            depth: x + y + 0.5,
            draw: (g) => drawWallSegment(g, x, y, x + 1, y, WALL_HEIGHT, WALL_TOP, WALL_LEFT, WALL_RIGHT),
          });
        } else if (this.lot.getHDoor(x, y)) {
          items.push({
            depth: x + y + 0.5,
            draw: (g) => drawDoorway(g, x, y, x + 1, y, WALL_HEIGHT, WALL_TOP, WALL_LEFT, WALL_RIGHT),
          });
        }
      }
    }
    for (let y = 0; y < this.lot.height; y++) {
      for (let x = 0; x < this.lot.width; x++) {
        const diagonal = this.lot.getDiagonal(x, y);
        if (diagonal === "nwse") {
          items.push({
            depth: x + y + 0.5,
            draw: (g) => drawWallSegment(g, x, y, x + 1, y + 1, WALL_HEIGHT, WALL_TOP, WALL_LEFT, WALL_RIGHT),
          });
        } else if (diagonal === "nesw") {
          items.push({
            depth: x + y + 0.5,
            draw: (g) => drawWallSegment(g, x + 1, y, x, y + 1, WALL_HEIGHT, WALL_TOP, WALL_LEFT, WALL_RIGHT),
          });
        }
      }
    }
    for (let y = 0; y <= this.lot.height; y++) {
      for (let x = 0; x <= this.lot.width; x++) {
        const hasWall =
          this.lot.getVWall(x, y - 1) ||
          this.lot.getVWall(x, y) ||
          this.lot.getHWall(x - 1, y) ||
          this.lot.getHWall(x, y) ||
          this.lot.getVDoor(x, y - 1) ||
          this.lot.getVDoor(x, y) ||
          this.lot.getHDoor(x - 1, y) ||
          this.lot.getHDoor(x, y) ||
          this.lot.getDiagonal(x, y) === "nwse" ||
          this.lot.getDiagonal(x - 1, y - 1) === "nwse" ||
          this.lot.getDiagonal(x - 1, y) === "nesw" ||
          this.lot.getDiagonal(x, y - 1) === "nesw";
        if (hasWall) {
          items.push({
            depth: x + y,
            draw: (g) => drawWallPost(g, x, y, WALL_HEIGHT, WALL_TOP, WALL_LEFT, WALL_RIGHT),
          });
        }
      }
    }

    for (const obj of this.lot.objects) {
      items.push({
        depth: obj.gridX + obj.gridY + 0.01,
        draw: (g) => drawObject(g, obj),
      });
    }

    for (const sim of sims) {
      items.push({
        depth: sim.x + sim.y + 0.02,
        draw: (g) => this.drawSim(g, sim, now),
      });
    }

    for (const pet of pets) {
      items.push({
        depth: pet.x + pet.y + 0.015,
        draw: (g) => this.drawPet(g, pet, now),
      });
    }

    items.sort((a, b) => a.depth - b.depth);
    for (const item of items) item.draw(this.scene);

    this.updateLabels(sims);
    this.updatePetLabels(pets);
  }

  private drawFloors(): void {
    for (let y = 0; y < this.lot.height; y++) {
      for (let x = 0; x < this.lot.width; x++) {
        const [n, e, s, w] = tileCorners(x, y);
        const base = this.lot.getFloor(x, y);
        const color = (x + y) % 2 === 0 ? base : shade(base, 0.92);
        this.floorGfx
          .poly([n.x, n.y, e.x, e.y, s.x, s.y, w.x, w.y])
          .fill(color)
          .stroke({ width: 1, color: FLOOR_LINE, alpha: 0.35 });
      }
    }
  }

  /** Soft blurred contact shadows for objects, Sims, and pets, rendered on their own filtered layer. */
  private drawShadows(sims: Sim[], pets: Pet[]): void {
    for (const obj of this.lot.objects) {
      const c = gridToScreen(obj.gridX + 0.5, obj.gridY + 0.5);
      this.shadowGfx.ellipse(c.x, c.y + 3, 17, 8).fill({ color: 0x000000, alpha: 0.4 });
    }
    for (const sim of sims) {
      const c = gridToScreen(sim.x + 0.5, sim.y + 0.5);
      this.shadowGfx.ellipse(c.x, c.y + 2, 11, 5).fill({ color: 0x000000, alpha: 0.4 });
    }
    for (const pet of pets) {
      const c = gridToScreen(pet.x + 0.5, pet.y + 0.5);
      this.shadowGfx.ellipse(c.x, c.y + 1, 7, 3.5).fill({ color: 0x000000, alpha: 0.35 });
    }
  }

  private drawSim(g: Graphics, sim: Sim, now: number): void {
    const center = gridToScreen(sim.x + 0.5, sim.y + 0.5);
    const baseY = center.y;
    const walking = sim.state === "walking";
    const bob = walking ? Math.sin(now / 90 + sim.id) * 2 : 0;

    if (sim.id === this.selectedSimId) {
      g.ellipse(center.x, baseY + 2, 14, 7).fill({ color: 0xffffff, alpha: 0.25 });
    }

    const bodyTop = baseY - 30 + bob;
    const bodyBottom = baseY - 4;
    const hairColor = shade(sim.color, 0.4);
    const skinTone = 0xe8c39e;

    // Legs — pill-shaped, full-radius rounded rects read as soft limbs rather than blocks.
    g.roundRect(center.x - 6, bodyBottom - 10, 5, 10, 2.5).fill(shade(sim.color, 0.55));
    g.roundRect(center.x + 1, bodyBottom - 10, 5, 10, 2.5).fill(shade(sim.color, 0.45));

    // Torso (two-tone shirt), generously rounded into a soft capsule.
    g.roundRect(center.x - 8, bodyTop, 16, 20, 8).fill(sim.color);
    g.roundRect(center.x - 8, bodyTop + 11, 16, 9, 6).fill(shade(sim.color, 0.72));

    // Arms
    const armSwing = walking ? Math.sin(now / 90 + sim.id + Math.PI) * 3 : 0;
    g.roundRect(center.x - 11, bodyTop + 2 + armSwing, 3.5, 14, 1.75).fill(skinTone);
    g.roundRect(center.x + 7.5, bodyTop + 2 - armSwing, 3.5, 14, 1.75).fill(skinTone);

    // Head + rounded hair cap
    const headY = bodyTop - 8;
    g.circle(center.x, headY, 8.5).fill(skinTone);
    g.circle(center.x, headY - 3.5, 7.5).fill(hairColor);
    g.roundRect(center.x - 7.5, headY - 6, 15, 7, 4).fill(hairColor);

    // Simple face
    const faceDx = Math.sign(sim.facing.dx) * 2.5;
    g.circle(center.x + faceDx - 2, headY, 1).fill(0x2a2018);
    g.circle(center.x + faceDx + 2, headY, 1).fill(0x2a2018);

    if (sim.state === "using" || sim.state === "socializing") {
      g.circle(center.x + 12, headY - 10, 3).fill(0xffe066);
    }
  }

  /** A small, low quadruped silhouette — simple enough to read at a glance as "pet" rather than "furniture". */
  private drawPet(g: Graphics, pet: Pet, now: number): void {
    const center = gridToScreen(pet.x + 0.5, pet.y + 0.5);
    const walking = pet.state === "walking";
    const bob = walking ? Math.sin(now / 70 + pet.id) * 1.2 : 0;
    const baseY = center.y - 4 + bob;
    const faceDx = Math.sign(pet.facing.dx) || 1;

    const bodyColor = pet.color;
    const darkColor = shade(pet.color, 0.6);

    // Legs — four tiny stubs under the body.
    for (const lx of [-6, -1, 3, 7]) {
      g.roundRect(center.x + lx, baseY + 1, 2.5, 4, 1).fill(darkColor);
    }

    // Body — a low, horizontal capsule.
    g.roundRect(center.x - 9, baseY - 6, 18, 9, 4.5).fill(bodyColor);

    // Tail, trailing opposite the facing direction.
    g.roundRect(center.x - faceDx * 11, baseY - 7, 4, 3, 1.5).fill(bodyColor);

    // Head, offset toward the facing direction.
    const headX = center.x + faceDx * 8;
    g.circle(headX, baseY - 6, 5).fill(bodyColor);

    // Ears distinguish the two pet types at a glance: pointy for cats, small rounded droops for dogs.
    if (pet.type === "cat") {
      g.poly([headX - 3, baseY - 10, headX - 1, baseY - 15, headX + 1, baseY - 10]).fill(darkColor);
      g.poly([headX + 1, baseY - 10, headX + 3, baseY - 15, headX + 5, baseY - 10]).fill(darkColor);
    } else {
      g.ellipse(headX - 3, baseY - 7, 2, 4).fill(darkColor);
      g.ellipse(headX + 3, baseY - 7, 2, 4).fill(darkColor);
    }

    g.circle(headX + faceDx * 3, baseY - 6, 0.8).fill(0x1a1410);
  }

  private updateLabels(sims: Sim[]): void {
    const seen = new Set<number>();
    for (const sim of sims) {
      seen.add(sim.id);
      let label = this.simLabels.get(sim.id);
      if (!label) {
        label = new Text({
          text: sim.name,
          style: new TextStyle({
            fill: 0xffffff,
            fontSize: 11,
            fontWeight: "600",
            stroke: { color: 0x000000, width: 3 },
          }),
        });
        label.anchor.set(0.5, 1);
        this.labelsLayer.addChild(label);
        this.simLabels.set(sim.id, label);
      }
      const center = gridToScreen(sim.x + 0.5, sim.y + 0.5);
      label.position.set(center.x, center.y - 46);
      label.alpha = sim.id === this.selectedSimId ? 1 : 0.85;
    }
    for (const [id, label] of this.simLabels) {
      if (!seen.has(id)) {
        label.destroy();
        this.simLabels.delete(id);
      }
    }
  }

  private updatePetLabels(pets: Pet[]): void {
    const seen = new Set<number>();
    for (const pet of pets) {
      seen.add(pet.id);
      let label = this.petLabels.get(pet.id);
      if (!label) {
        label = new Text({
          text: pet.name,
          style: new TextStyle({
            fill: 0xffffff,
            fontSize: 9,
            fontWeight: "600",
            stroke: { color: 0x000000, width: 2.5 },
          }),
        });
        label.anchor.set(0.5, 1);
        this.labelsLayer.addChild(label);
        this.petLabels.set(pet.id, label);
      }
      const center = gridToScreen(pet.x + 0.5, pet.y + 0.5);
      label.position.set(center.x, center.y - 22);
      label.alpha = 0.8;
    }
    for (const [id, label] of this.petLabels) {
      if (!seen.has(id)) {
        label.destroy();
        this.petLabels.delete(id);
      }
    }
  }
}
