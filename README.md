# OpenSims

An open-source, browser-based recreation of **The Sims 1**'s core life-simulation loop: an isometric lot, Sims with needs that decay over time, autonomous AI that satisfies those needs, and Build/Buy modes for editing the lot.

This is an early foundation, not a feature-complete clone. It's meant to be a clean base for the community to build on.

**On the art:** The Sims 1 (2000) is still under copyright — it won't enter the public domain for decades — so this project doesn't use or copy EA's actual assets, character designs, or textures. The visual style (soft, rounded, warm-lit isometric look) is original and independently drawn (`render/ObjectArt.ts`), aiming for the *genre feel* of a life-sim rather than any specific game's protected artwork.

## Stack

- TypeScript + [Vite](https://vitejs.dev/) for the dev server / build
- [PixiJS](https://pixijs.com/) (WebGL) for 2D isometric rendering
- No build-time asset pipeline — there's no external art dependency to get a session running. Objects and Sims are all procedurally drawn vector shapes (`render/IsoDraw.ts`, `render/ObjectArt.ts`) rather than sprite sheets, but each object type gets its own distinguishing silhouette and detail (a fridge with a seam and handles, a bookshelf with colored book spines, a TV with a lit screen, and so on) instead of a plain colored block

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # production build to dist/
npm run typecheck
```

## Controls

- **Drag** to pan the camera, **scroll** to zoom
- **Live mode**: click a Sim to select them and watch their motives in the bottom-left panel
- **Buy mode**: pick an object from the palette, then click a floor tile to place it
- **Walls mode**: click near an edge of a tile to toggle a wall on that edge — walls live on tile boundaries, so a click is matched to whichever of the tile's 4 edges it landed closest to
- **+ Sim mode**: opens a Create Sim modal (name, color, and the five personality trait sliders) — submitting it arms placement, then click an open floor tile to add them to the household; **Remove** in the Sim panel deletes the selected one
- Speed controls (`II`, `1x`, `2x`, `3x`) control simulation speed, matching the classic pause/play/fast-forward keys
- **Save** writes the lot and Sims to `localStorage`; **Reset** discards the save and reloads the starter lot
- The **Career** section in the Sim panel assigns a job; the Sim automatically leaves for their shift and comes home with a paycheck

The starter household is Bella and Mortimer Goth, The Sims 1's iconic premade neighbors. Sims added later draw from a pool of other classic-series first names.

## Architecture

```
src/
  engine/       Generic engine bits: isometric math, A* pathfinding, the sim-time clock
  game/         Game rules: Lot (grid + walls + objects), Sim (state machine + motives),
                the object catalog, and the autonomy AI
  render/       IsoRenderer (camera, input picking, draw order), IsoDraw (shared box/face
                geometry helpers), ObjectArt (per-object-type procedural decoration)
  ui/           HUD — DOM-based overlay for motives, speed, and build/buy controls
```

`game/SaveGame.ts` (de)serializes the lot (dimensions, walls, objects) and Sims (position, motives) to a single `localStorage` key.

### Walls

Walls live on tile *edges*, the way they do in the actual Sims games — not filling a tile the way this project's own first pass at walls did. `Lot.ts` stores two boolean edge grids (`vWalls`/`hWalls`, one entry per vertical/horizontal tile boundary) instead of a per-tile flag, so every tile is real floor and a doorway gap is an exact single opening rather than a whole missing wall tile. `Lot.canMove(x1,y1,x2,y2)` is the single source of truth for whether a Sim can step between two adjacent tiles — it checks the shared edge for orthogonal moves and requires both straight "legs" clear for diagonal ones — and both `Pathfinding.ts` and `Sim.stepWalk`'s mid-walk replan check call it, so a wall built while a Sim is already walking through it makes them reroute. Rendering reuses the same soft-shaded box-face geometry as furniture (`IsoDraw.drawWallSegment`/`drawWallPost`) with a thin footprint instead of a whole-tile diamond, plus a small corner post at every vertex touching a wall so adjacent segments don't show a gap where they meet.

Zero-thickness edges also make a real (if basic) room-detection utility possible: `Lot.getRoomTiles(x,y)` flood-fills the connected region reachable without crossing a *present* wall edge. Worth being precise about what that means: a doorway gap is indistinguishable from open floor to this flood-fill, so two rooms joined by a doorway come back as one region — this is reachability, not true Sims-style room membership, where each side of a door still counts as its own room. It now feeds `Lot.computeRoomScore`, described below.

### Core simulation loop

1. `SimClock` converts real elapsed time into sim-minutes at the current speed (paused/1x/2x/3x).
2. Each `Sim` decays its motives (hunger, energy, bladder, hygiene, social, fun) every sim-minute, and steps whatever it's currently doing — walking a path, using an object, or socializing with another Sim.
3. `updateAI` runs an autonomy pass each tick: any idle Sim whose most urgent motive drops below a threshold will path to the nearest free object that satisfies it (or, for social, path to and start chatting with another idle Sim).
4. `IsoRenderer` redraws the lot every frame — floor tiles, then walls/objects/Sims painter-sorted back-to-front by grid depth.

### Room quality

Room is a seventh motive, but it doesn't decay like the others — `Sim.update` overwrites it every tick with `Lot.computeRoomScore(gridX, gridY)`, a direct read of the Sim's current surroundings rather than a need that drains over time. The score comes from the total `decorValue` of every object in the Sim's connected region (via `getRoomTiles`): `clamp(0, 100, 10 + totalDecor * 1.2)`, so a bare room floors at 10 and a well-furnished one climbs toward 100 as you buy more (each `ObjectCatalog.ts` entry has its own `decorValue` — decorative pieces like a painting or plant score higher relative to their price than a plain fixture like a sink). Since it's folded into `MOTIVE_TYPES`, it counts toward overall mood the same as any other motive for free. Skipped while a Sim is `atWork`, since they're off the lot with no current room to reflect. Given the doorway-merges-rooms caveat above, right now this reads as "how well is the whole connected house decorated" rather than a true per-room score — accurate to the underlying reachability model, just not as granular as the real thing yet.

### Personality and relationships

Each Sim has a `Personality` (`game/Personality.ts`): five traits scored 0-10 — Neat, Outgoing, Active, Playful, Nice — loosely modeled on The Sims 1's own personality-point system (original gameplay numbers, not a copy). `TRAIT_FOR_MOTIVE` in `types.ts` maps a trait to the motive it modulates (Playful→fun, Outgoing→social, Neat→hygiene), so a highly playful Sim gets more out of watching TV than a serious one. Outgoing also shifts the AI's social urgency threshold in `AI.ts`, so outgoing Sims seek company well before it's dire and shy ones tolerate more isolation. Each Sim tracks a relationship score (-100..100) with every other Sim it's socialized with, built up over time scaled by the Nice trait, and shown in the HUD when that Sim is selected.

### Money and jobs

The household shares one `funds` balance (starting at §3,000), spent in Buy mode — each object in `ObjectCatalog.ts` has a `price`, and a placement is refused with a "Not enough funds" flash if the household can't afford it. `game/Job.ts` defines a handful of career tracks (Paper Route, Retail, Business, Science), each a list of `JobLevel`s with their own title, daily pay, and leave/return time. `game/Jobs.ts` runs every tick: any Sim on a track whose shift has started gets interrupted (whatever they were doing) and marked `atWork` — hidden from the lot entirely, since there's no actual workplace or commute animation, just the classic Sims abstraction of "they're gone for the day" — then reappears at quitting time with the day's pay added to the household funds. Jobs only run Monday-Friday (`WORK_DAYS` in `Job.ts`); weekends are automatically off.

Promotions and firing both run on the same return-from-work event: each Sim's motives (hunger, energy, hygiene, fun) are snapshotted into a 0-100 "performance" score the moment they *leave* for their shift — the Sims 1 idea that showing up well-rested, fed, and groomed is what gets you ahead — and that score scales how much `promotionProgress` gains toward the next level (a track's `daysToPromote` is roughly how many good days it takes at full performance). Hit 100% and the Sim levels up, resetting progress and firing a toast (`HUD.flashPromotion`) with their new title; the Sim panel's career section shows the live progress bar. A track's last level has `daysToPromote: 0` and simply caps out. On the flip side, two consecutive workdays with performance below a low threshold gets a Sim fired — their career resets to unemployed and a red toast (`HUD.flashFired`) breaks the news; one bad day alone doesn't put a job at risk, only stringing two together does.

### Current simplifications (good first-contribution targets)

- **Walls are still axis-aligned edges** — real edge walls now (not tile-filling), but no diagonal walls yet.
- **Room quality isn't per-room** — see Room quality above; a doorway merges the rooms it connects into one flood-fill region, so decorating one room raises the score everywhere connected to it, not just that room.
- **Still no sprite art** — object/Sim detail is procedural vector drawing (`ObjectArt.ts`), not sprite sheets: soft blurred contact shadows, a two-layer "glow" fake instead of real gradients (PixiJS's `FillGradient` allocates a GPU texture per instance, which isn't safe to recreate every frame the way this scene redraws), and rounded/capsule Sim bodies instead of flat boxes. It reads much less "voxel game" than flat blocks, but real hand-drawn isometric sprites would still be a big visual upgrade, especially for Sims.
- **No mid-life customization** — the Create Sim modal covers name/color/personality up front, but there's no way to rename a Sim or edit their traits after they're already placed.
- **Relationships are a single scalar** — no relationship types (friend/romantic/enemy), no memory of specific events, just one number that goes up when Sims chat.
- **A single flat save slot** — one `localStorage` key, no named saves or multiple households.
- **No multi-lot / neighborhood view** — one lot, no traveling between lots.
- **Firing is a blunt, streak-based check** — two bad departure snapshots in a row and a Sim is out, with no partial warning state or way to see the streak coming; motives also keep decaying normally while a Sim is at work with nothing checking them mid-shift (only the departure snapshot matters).

## Contributing

The architecture is intentionally small and decoupled — `engine/` has no game-specific knowledge, `game/` has no rendering knowledge, and `render/`/`ui/` only read state. Adding a new object is as simple as adding an entry to `ObjectCatalog.ts`; adding a new motive means touching `game/types.ts` and `Motives.ts`.
