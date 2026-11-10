import { Application, BlurFilter, Container, Graphics, Text, TextStyle } from "pixi.js";
import { gridToScreen, screenToGrid } from "../engine/IsoMath.ts";
import { tileCorners, drawWallSegment, drawWallPost, drawDoorway, shade } from "./IsoDraw.ts";
import { drawObject } from "./ObjectArt.ts";
import { computeDayNightTint } from "./DayNight.ts";
import { zoomCameraTo, pointerMidpoint, pointerDistance, type ScreenPoint } from "./Camera.ts";
import { floorTexture, wallPanelTexture, fabricTexture } from "./Textures.ts";
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

/** What a right-click landed on, in hit-test priority order: a Sim, then a pet, then an object occupying that tile, then the bare tile. */
export type ContextMenuTarget =
  | { kind: "sim"; simId: number }
  | { kind: "pet"; petId: number }
  | { kind: "object"; objectId: number }
  | { kind: "tile"; gx: number; gy: number };

export interface RendererCallbacks {
  /** fracX/fracY are the click's position within the tile (0-1 each), for edge-targeting in Build mode. */
  onTileClick?: (gx: number, gy: number, fracX: number, fracY: number) => void;
  onSimClick?: (simId: number) => void;
  /** pageX/pageY are the right-click's raw client coordinates, for positioning a DOM context menu directly. */
  onContextMenu?: (target: ContextMenuTarget, pageX: number, pageY: number) => void;
}

export class IsoRenderer {
  app!: Application;
  world!: Container;
  private floorGfx!: Graphics;
  private shadowLayer!: Container;
  private shadowGfx!: Graphics;
  private scene!: Graphics;
  private tintGfx!: Graphics;
  private labelsLayer!: Container;
  private simLabels = new Map<number, Text>();
  private petLabels = new Map<number, Text>();
  private lot!: Lot;
  private getSims!: () => Sim[];
  private getPets: () => Pet[] = () => [];
  private getMinuteOfDay: () => number = () => 12 * 60;
  private callbacks: RendererCallbacks = {};
  selectedSimId: number | null = null;

  private dragging = false;
  private dragMoved = false;
  private lastPointer = { x: 0, y: 0 };
  // Keyed by PointerEvent.pointerId, so a single-finger drag and a two-finger
  // pinch can be told apart — a mouse only ever contributes one entry, so
  // desktop behavior is unaffected; this only activates the pinch path once
  // a second touch point joins.
  private activePointers = new Map<number, ScreenPoint>();
  private pinchStartDistance = 0;
  private pinchStartScale = 1;

  async init(
    holder: HTMLElement,
    lot: Lot,
    getSims: () => Sim[],
    getPets: () => Pet[],
    getMinuteOfDay: () => number,
    callbacks: RendererCallbacks,
  ) {
    this.lot = lot;
    this.getSims = getSims;
    this.getPets = getPets;
    this.getMinuteOfDay = getMinuteOfDay;
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

    // A fixed-to-viewport overlay for the day/night ambient wash — a sibling
    // of `world` (not a child of it) so panning/zooming the camera never
    // moves or scales it; it always covers exactly what's on screen.
    this.tintGfx = new Graphics();
    this.app.stage.addChild(this.tintGfx);

    this.setupPointerHandlers();
    this.app.ticker.add(() => this.render());
  }

  /** Repoints the renderer at a different lot entirely — switching which house is on screen (see main.ts's enterHouse). Sims/pets are already read live via the getters passed to init, so only the lot itself needs a setter. */
  setLot(lot: Lot): void {
    this.lot = lot;
  }

  private setupPointerHandlers(): void {
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.cursor = "grab";
    // Hand the browser's own touch gestures (page scroll, pinch-zoom,
    // double-tap-zoom) off entirely — our own pointer handlers below own
    // pan and pinch-zoom instead, so nothing fights them on mobile.
    canvas.style.touchAction = "none";

    canvas.addEventListener("pointerdown", (e) => {
      // Right/middle mouse buttons are reserved for the context menu below —
      // only the primary button (or any touch/pen contact) drives pan/click.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Can fail in rare edge cases (pointer already released, certain
        // browser quirks) — harmless to skip; gesture tracking below doesn't
        // depend on capture succeeding.
      }
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.activePointers.size === 1) {
        this.dragging = true;
        this.dragMoved = false;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = "grabbing";
      } else if (this.activePointers.size === 2) {
        // A second touch point turns this into a pinch, not a pan or a tap.
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
        // One finger lifted out of a pinch — resume a plain pan from here
        // rather than ending the whole gesture.
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

    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const worldX = (px - this.world.x) / this.world.scale.x;
      const worldY = (py - this.world.y) / this.world.scale.y;
      const target = this.resolveContextTarget(worldX, worldY);
      if (target) this.callbacks.onContextMenu?.(target, e.clientX, e.clientY);
    });
  }

  /** Sim, then pet, then an object occupying that exact tile, then the bare tile — in that priority order. */
  private resolveContextTarget(worldX: number, worldY: number): ContextMenuTarget | null {
    for (const sim of this.getSims()) {
      if (sim.state === "atWork") continue;
      const p = gridToScreen(sim.x + 0.5, sim.y + 0.5);
      if (Math.hypot(p.x - worldX, p.y - worldY) < 18) return { kind: "sim", simId: sim.id };
    }
    for (const pet of this.getPets()) {
      const p = gridToScreen(pet.x + 0.5, pet.y + 0.5);
      if (Math.hypot(p.x - worldX, p.y - worldY) < 14) return { kind: "pet", petId: pet.id };
    }
    const gp = screenToGrid(worldX, worldY);
    const gx = Math.floor(gp.x);
    const gy = Math.floor(gp.y);
    const obj = this.lot.objects.find((o) => o.gridX === gx && o.gridY === gy);
    if (obj) return { kind: "object", objectId: obj.id };
    return { kind: "tile", gx, gy };
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
            draw: (g) => drawWallSegment(g, x, y, x, y + 1, WALL_HEIGHT, WALL_TOP, WALL_LEFT, WALL_RIGHT, undefined, wallPanelTexture()),
          });
        } else if (this.lot.getVDoor(x, y)) {
          items.push({
            depth: x + y + 0.5,
            draw: (g) => drawDoorway(g, x, y, x, y + 1, WALL_HEIGHT, WALL_TOP, WALL_LEFT, WALL_RIGHT, undefined, wallPanelTexture()),
          });
        }
      }
    }
    for (let y = 0; y <= this.lot.height; y++) {
      for (let x = 0; x < this.lot.width; x++) {
        if (this.lot.getHWall(x, y)) {
          items.push({
            depth: x + y + 0.5,
            draw: (g) => drawWallSegment(g, x, y, x + 1, y, WALL_HEIGHT, WALL_TOP, WALL_LEFT, WALL_RIGHT, undefined, wallPanelTexture()),
          });
        } else if (this.lot.getHDoor(x, y)) {
          items.push({
            depth: x + y + 0.5,
            draw: (g) => drawDoorway(g, x, y, x + 1, y, WALL_HEIGHT, WALL_TOP, WALL_LEFT, WALL_RIGHT, undefined, wallPanelTexture()),
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
            draw: (g) => drawWallSegment(g, x, y, x + 1, y + 1, WALL_HEIGHT, WALL_TOP, WALL_LEFT, WALL_RIGHT, undefined, wallPanelTexture()),
          });
        } else if (diagonal === "nesw") {
          items.push({
            depth: x + y + 0.5,
            draw: (g) => drawWallSegment(g, x + 1, y, x, y + 1, WALL_HEIGHT, WALL_TOP, WALL_LEFT, WALL_RIGHT, undefined, wallPanelTexture()),
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

    this.tintGfx.clear();
    const tint = computeDayNightTint(this.getMinuteOfDay());
    if (tint.alpha > 0) {
      this.tintGfx.rect(0, 0, this.app.renderer.width, this.app.renderer.height).fill({ color: tint.color, alpha: tint.alpha });
    }
  }

  private drawFloors(): void {
    for (let y = 0; y < this.lot.height; y++) {
      for (let x = 0; x < this.lot.width; x++) {
        const [n, e, s, w] = tileCorners(x, y);
        const base = this.lot.getFloor(x, y);
        const color = (x + y) % 2 === 0 ? base : shade(base, 0.92);
        this.floorGfx
          .poly([n.x, n.y, e.x, e.y, s.x, s.y, w.x, w.y])
          .fill({ color, texture: floorTexture(), textureSpace: "global" })
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
    const talking = sim.state === "socializing";
    const bob = walking ? Math.sin(now / 90 + sim.id) * 2 : 0;
    const facingSign = Math.sign(sim.facing.dx) || 1;
    // A bit faster and choppier than the walk cycle so it reads as chatter,
    // not a stride — a nodding head, a flapping mouth, and one gesturing arm
    // (whichever side the Sim is already facing, i.e. toward their partner).
    const headBob = talking ? Math.sin(now / 55 + sim.id * 2) * 1.3 : 0;
    const talkFlutter = talking ? Math.sin(now / 45 + sim.id * 3) * 1.1 : 0;
    const talkGesture = talking ? Math.sin(now / 70 + sim.id * 1.7) * 2.5 : 0;

    if (sim.id === this.selectedSimId) {
      g.ellipse(center.x, baseY + 2, 14, 7).fill({ color: 0xffffff, alpha: 0.25 });
    }

    const bodyTop = baseY - 30 + bob;
    const bodyBottom = baseY - 4;
    const hairColor = shade(sim.color, 0.4);
    const skinTone = 0xe8c39e;

    // Legs — a scissoring fore/aft stride while walking (each leg's rounded
    // rect shifts horizontally, opposite the other), the same sine phase as
    // the arm swing below so the whole gait reads as one coordinated motion
    // instead of a torso sliding over static feet.
    const legStride = walking ? Math.sin(now / 90 + sim.id) * 2.5 : 0;
    g.roundRect(center.x - 6 + legStride, bodyBottom - 10, 5, 10, 2.5).fill(shade(sim.color, 0.55));
    g.roundRect(center.x + 1 - legStride, bodyBottom - 10, 5, 10, 2.5).fill(shade(sim.color, 0.45));

    // Torso (two-tone shirt), generously rounded into a soft capsule. A
    // fine crosshatch texture (tinted by the Sim's own color, like the
    // floor/wall textures) gives the shirt a woven-fabric feel up close.
    g.roundRect(center.x - 8, bodyTop, 16, 20, 8).fill({ color: sim.color, texture: fabricTexture(), textureSpace: "global" });
    g.roundRect(center.x - 8, bodyTop + 11, 16, 9, 6).fill({
      color: shade(sim.color, 0.72),
      texture: fabricTexture(),
      textureSpace: "global",
    });

    // Arms — while talking, the arm on the side the Sim is already facing
    // (i.e. toward their conversation partner) gets a small extra gesture
    // motion layered on top of the walk swing (which is 0 here anyway).
    const armSwing = walking ? Math.sin(now / 90 + sim.id + Math.PI) * 3 : 0;
    const leftGesture = facingSign < 0 ? talkGesture : 0;
    const rightGesture = facingSign > 0 ? talkGesture : 0;
    g.roundRect(center.x - 11, bodyTop + 2 + armSwing + leftGesture, 3.5, 14, 1.75).fill(skinTone);
    g.roundRect(center.x + 7.5, bodyTop + 2 - armSwing - rightGesture, 3.5, 14, 1.75).fill(skinTone);

    // Head + rounded hair cap — nods gently while talking.
    const headY = bodyTop - 8 + headBob;
    g.circle(center.x, headY, 8.5).fill(skinTone);
    g.circle(center.x, headY - 3.5, 7.5).fill(hairColor);
    g.roundRect(center.x - 7.5, headY - 6, 15, 7, 4).fill(hairColor);

    // Simple face
    const faceDx = facingSign * 2.5;
    g.circle(center.x + faceDx - 2, headY, 1).fill(0x2a2018);
    g.circle(center.x + faceDx + 2, headY, 1).fill(0x2a2018);

    // Mouth — curves into a smile or frown based on overall mood, so a Sim's
    // face actually reflects how they're doing rather than staying neutral.
    // While socializing, a small flutter rides on top of that resting shape
    // to read as talking rather than a fixed expression.
    const moodT = Math.max(-1, Math.min(1, sim.motives.mood / 60));
    const mouthX = center.x + faceDx;
    const mouthY = headY + 3.3;
    const mouthHalfWidth = 2.1;
    const mouthCurve = moodT * 2 + talkFlutter;
    g.moveTo(mouthX - mouthHalfWidth, mouthY)
      .quadraticCurveTo(mouthX, mouthY + mouthCurve, mouthX + mouthHalfWidth, mouthY)
      .stroke({ width: 1, color: 0x2a2018 });

    if (sim.state === "using" || sim.state === "socializing" || sim.state === "petting") {
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

    // Legs — four tiny stubs under the body. While walking, diagonal pairs
    // (front-left+back-right, front-right+back-left) alternately lift, a
    // simplified trot that's enough to read as stepping rather than sliding.
    const legOffsets = [-6, -1, 3, 7];
    for (let i = 0; i < legOffsets.length; i++) {
      const phase = i === 0 || i === 3 ? 0 : Math.PI;
      const lift = walking ? Math.max(0, Math.sin(now / 70 + pet.id + phase)) * 1.3 : 0;
      g.roundRect(center.x + legOffsets[i], baseY + 1 - lift, 2.5, 4, 1).fill(darkColor);
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
