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
- **Walls mode**: click a tile to toggle a wall on/off
- **+ Sim mode**: click an open floor tile to add a new Sim to the household; **Remove** in the Sim panel deletes the selected one
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

### Core simulation loop

1. `SimClock` converts real elapsed time into sim-minutes at the current speed (paused/1x/2x/3x).
2. Each `Sim` decays its motives (hunger, energy, bladder, hygiene, social, fun) every sim-minute, and steps whatever it's currently doing — walking a path, using an object, or socializing with another Sim.
3. `updateAI` runs an autonomy pass each tick: any idle Sim whose most urgent motive drops below a threshold will path to the nearest free object that satisfies it (or, for social, path to and start chatting with another idle Sim).
4. `IsoRenderer` redraws the lot every frame — floor tiles, then walls/objects/Sims painter-sorted back-to-front by grid depth.

### Personality and relationships

Each Sim has a `Personality` (`game/Personality.ts`): five traits scored 0-10 — Neat, Outgoing, Active, Playful, Nice — loosely modeled on The Sims 1's own personality-point system (original gameplay numbers, not a copy). `TRAIT_FOR_MOTIVE` in `types.ts` maps a trait to the motive it modulates (Playful→fun, Outgoing→social, Neat→hygiene), so a highly playful Sim gets more out of watching TV than a serious one. Outgoing also shifts the AI's social urgency threshold in `AI.ts`, so outgoing Sims seek company well before it's dire and shy ones tolerate more isolation. Each Sim tracks a relationship score (-100..100) with every other Sim it's socialized with, built up over time scaled by the Nice trait, and shown in the HUD when that Sim is selected.

### Money and jobs

The household shares one `funds` balance (starting at §3,000), spent in Buy mode — each object in `ObjectCatalog.ts` has a `price`, and a placement is refused with a "Not enough funds" flash if the household can't afford it. `game/Job.ts` defines a small single-tier career list (title, daily pay, and a leave/return time), and `game/Jobs.ts` runs every tick: any Sim with a job whose shift has started gets interrupted (whatever they were doing) and marked `atWork` — hidden from the lot entirely, since there's no actual workplace or commute animation, just the classic Sims abstraction of "they're gone for the day" — then reappears at quitting time with the day's pay added to the household funds. Jobs only run Monday-Friday (`WORK_DAYS` in `Job.ts`); weekends are automatically off.

### Current simplifications (good first-contribution targets)

- **Walls occupy whole tiles** rather than living on tile edges like the original Sims wall system — simpler pathfinding/rendering, but no diagonal walls yet.
- **Still no sprite art** — object/Sim detail is procedural vector drawing (`ObjectArt.ts`), not sprite sheets: soft blurred contact shadows, a two-layer "glow" fake instead of real gradients (PixiJS's `FillGradient` allocates a GPU texture per instance, which isn't safe to recreate every frame the way this scene redraws), and rounded/capsule Sim bodies instead of flat boxes. It reads much less "voxel game" than flat blocks, but real hand-drawn isometric sprites would still be a big visual upgrade, especially for Sims.
- **No Sim creation flow** — new Sims spawn with a name/color from a fixed pool and a randomized personality; there's no UI to name them or hand-pick traits yet.
- **Relationships are a single scalar** — no relationship types (friend/romantic/enemy), no memory of specific events, just one number that goes up when Sims chat.
- **A single flat save slot** — one `localStorage` key, no named saves or multiple households.
- **No multi-lot / neighborhood view** — one lot, no traveling between lots.
- **Jobs are single-tier** — no promotions, no performance requirements, and no chance of getting fired; motives keep decaying normally while a Sim is at work, but nothing currently checks them.

## Contributing

The architecture is intentionally small and decoupled — `engine/` has no game-specific knowledge, `game/` has no rendering knowledge, and `render/`/`ui/` only read state. Adding a new object is as simple as adding an entry to `ObjectCatalog.ts`; adding a new motive means touching `game/types.ts` and `Motives.ts`.
