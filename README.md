# OpenSims

An open-source, browser-based recreation of **The Sims 1**'s core life-simulation loop: an isometric lot, Sims with needs that decay over time, autonomous AI that satisfies those needs, and Build/Buy modes for editing the lot.

This is an early foundation, not a feature-complete clone. It's meant to be a clean base for the community to build on.

## Stack

- TypeScript + [Vite](https://vitejs.dev/) for the dev server / build
- [PixiJS](https://pixijs.com/) (WebGL) for 2D isometric rendering
- No build-time asset pipeline yet — objects and Sims are drawn as simple colored blocks/tokens rather than sprite art, so there's no art dependency to get a session running

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
- Speed controls (`II`, `1x`, `2x`, `3x`) control simulation speed, matching the classic pause/play/fast-forward keys

## Architecture

```
src/
  engine/       Generic engine bits: isometric math, A* pathfinding, the sim-time clock
  game/         Game rules: Lot (grid + walls + objects), Sim (state machine + motives),
                the object catalog, and the autonomy AI
  render/       IsoRenderer — PixiJS-based isometric rendering, camera, and input picking
  ui/           HUD — DOM-based overlay for motives, speed, and build/buy controls
```

### Core simulation loop

1. `SimClock` converts real elapsed time into sim-minutes at the current speed (paused/1x/2x/3x).
2. Each `Sim` decays its motives (hunger, energy, bladder, hygiene, social, fun) every sim-minute, and steps whatever it's currently doing — walking a path, using an object, or socializing with another Sim.
3. `updateAI` runs an autonomy pass each tick: any idle Sim whose most urgent motive drops below a threshold will path to the nearest free object that satisfies it (or, for social, path to and start chatting with another idle Sim).
4. `IsoRenderer` redraws the lot every frame — floor tiles, then walls/objects/Sims painter-sorted back-to-front by grid depth.

### Current simplifications (good first-contribution targets)

- **Walls occupy whole tiles** rather than living on tile edges like the original Sims wall system — simpler pathfinding/rendering, but no room detection or diagonal walls yet.
- **No sprite art** — objects and Sims are flat-colored blocks/tokens. Real isometric sprite sheets would be a big visual upgrade.
- **Two hardcoded Sims** with no creation flow, personality traits, or relationships tracking (Social just pushes both Sims' `social` motive on interaction).
- **A small object catalog** (`src/game/ObjectCatalog.ts`) with one interaction each — more objects/interactions are easy to add there.
- **No save/load** of lot or Sim state.
- **No multi-lot / neighborhood view.**

## Contributing

The architecture is intentionally small and decoupled — `engine/` has no game-specific knowledge, `game/` has no rendering knowledge, and `render/`/`ui/` only read state. Adding a new object is as simple as adding an entry to `ObjectCatalog.ts`; adding a new motive means touching `game/types.ts` and `Motives.ts`.
