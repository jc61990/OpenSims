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
- **Doors mode**: same edge-targeting as Walls mode, but turns an existing wall into a passable doorway (and back) instead of removing it outright — a door still separates rooms for scoring purposes, unlike just clearing the wall
- **Diagonals mode**: click a tile to place a diagonal wall across whichever of its two corners the click landed closer to (and click an existing one to remove it) — a diagonal consumes the whole tile (it's unwalkable, like furniture) rather than a true sub-tile cut; a tile with furniture on it is left alone
- **+ Sim mode**: opens a Create Sim modal (name, color, and the five personality trait sliders) — submitting it arms placement, then click an open floor tile to add them to the household; **Edit** in the Sim panel reopens the same modal prefilled with the selected Sim's current name/color/traits and applies changes in place (no re-placement needed); **Move** arms a single placement click that relocates the selected Sim to the clicked floor tile (a teleport, not a walk — the same invalid-tile-stays-armed behavior as + Sim's placement); **Remove** deletes the selected one
- Speed controls (`II`, `1x`, `2x`, `3x`) control simulation speed, matching the classic pause/play/fast-forward keys
- **Save** writes the current household to its active named slot (prompting for a name the first time); **Saves** opens a modal listing every saved household, each with its own Load/Rename/Delete, plus a "Save As" field to fork the current state into a new slot; **Reset** starts a fresh, unsaved household without touching anything already saved
- The **Career** section in the Sim panel assigns a job; the Sim automatically leaves for their shift and comes home with a paycheck

The starter household is Bella and Mortimer Goth, The Sims 1's iconic premade neighbors, joined by Larry Lubin — the town's mayor, an original character with sky-high Outgoing and pointedly middling Nice, already sitting at the top of the Politics career track (so he's usually off being mayor during business hours rather than standing around the lot). Sims added later draw from a pool of other classic-series first names.

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

`game/SaveGame.ts` (de)serializes the lot (dimensions, walls, objects) and Sims (position, motives) into named save slots, described below.

### Save slots

Multiple households can be saved side by side instead of one fixed `localStorage` key. `SaveGame.ts` keeps an ordered registry of slot names (`opensims:save:slots`) alongside each slot's own data (`opensims:save:slot:<name>`), and a separate `opensims:save:lastActive` pointer so reloading the page resumes whichever household you were last playing — `Save` without an active slot prompts for a name once, then quick-saves to it from then on; `Save As` in the Saves modal forks the current state into a brand-new slot and makes it active; `Reset` just clears the active-slot pointer and reloads to a fresh, unsaved household, it never deletes saved data. A one-time migration (`migrateLegacySave`) moves this project's original single fixed-key save into a slot named "My Household" the first time `listSaveSlots`/`getLastActiveSlot` runs after upgrading, so nobody's existing save is lost.

Each `saveToSlot` call stamps a `savedAt` timestamp into that slot's data, and `listSaveSlotsWithMeta()` pairs every slot name with its last-saved time plus a quick read of its Sim count and funds (pulled straight from the saved data rather than tracked separately) — the Saves modal shows this under each household's name so you can tell them apart without loading each one. A slot migrated from the pre-metadata legacy save has no `savedAt` and shows "unknown time" rather than crashing the modal. `renameSaveSlot(oldName, newName)` renames a slot in place — it moves the stored data to the new key, keeps the slot's original position in the list, and carries the last-active pointer forward if you rename the household you're currently playing; it refuses (and leaves everything untouched) if the new name collides with an existing slot.

### Walls

Walls live on tile *edges*, the way they do in the actual Sims games — not filling a tile the way this project's own first pass at walls did. `Lot.ts` stores two boolean edge grids (`vWalls`/`hWalls`, one entry per vertical/horizontal tile boundary) instead of a per-tile flag, so every tile is real floor and a doorway gap is an exact single opening rather than a whole missing wall tile. `Lot.canMove(x1,y1,x2,y2)` is the single source of truth for whether a Sim can step between two adjacent tiles — it checks the shared edge for orthogonal moves and requires both straight "legs" clear for diagonal ones — and both `Pathfinding.ts` and `Sim.stepWalk`'s mid-walk replan check call it, so a wall built while a Sim is already walking through it makes them reroute. Rendering reuses the same soft-shaded box-face geometry as furniture (`IsoDraw.drawWallSegment`/`drawWallPost`) with a thin footprint instead of a whole-tile diamond, plus a small corner post at every vertex touching a wall so adjacent segments don't show a gap where they meet.

Zero-thickness edges also make a real room-detection utility possible: `Lot.getRoomTiles(x,y)` flood-fills the connected region reachable without crossing a *present* wall or door edge. Doors (below) are the key distinction from a plain missing wall: a wall-less gap with no door placed is indistinguishable from open floor to this flood-fill and merges the rooms on either side into one region, but a door is passable while still bounding the flood-fill — true Sims-style room membership, where each side of a doorway counts as its own room. It feeds `Lot.computeRoomScore`, described below.

### Doors

A door is a distinct edge state from a plain missing wall — `Lot.vDoors`/`hDoors`, edge grids shaped exactly like `vWalls`/`hWalls`. Both are passable to a Sim (`Lot.canMove`/`hasWallBetween` treat them identically to open floor), but only a door also bounds `getRoomTiles`'s flood-fill; a wall-less gap with no door doesn't. **Doors mode** in the Sim panel toggles a wall on the nearest edge into a door (and a door back into a wall) — a door can only be placed where a wall already stands, since it needs a frame to hang in. Rendered as a doorway (`IsoDraw.drawDoorway`): two short jamb posts plus a header spanning the opening, leaving a Sim-height gap open underneath so it reads as passable at a glance, distinct from a full `drawWallSegment`. The starter lot's three interior openings are real doors, not just missing wall segments, so its four rooms each score independently.

### Diagonal walls

Diagonal walls are a deliberate simplification rather than a true sub-tile cut. Real Sims-style diagonal walls shave off just a triangular corner of a tile, leaving the rest walkable; this project doesn't have sub-tile walkability, so `Lot.ts` instead stores one `Diagonal` ("none" | "nwse" | "nesw") per *whole tile*, and a tile with either orientation set is entirely unwalkable — `isWalkableTile` checks it the same way it already checks furniture. The payoff is that the rest of the engine needs no changes at all: `canMove` already refuses to enter an unwalkable tile from any direction, so pathfinding routes around a diagonal exactly like it routes around a couch. Rendering reuses `IsoDraw.drawWallSegment` as-is — it was already generic over any two grid points, not just orthogonally-adjacent ones, so a diagonal spanning a tile's NW-SE or NE-SW corners draws with zero new geometry code; in this isometric projection a diagonal wall actually renders as a strictly vertical or horizontal line on screen, the same signature look real Sims diagonal walls have. **Diagonals mode** picks whichever of a tile's two diagonals the click landed closer to and toggles it on (clicking an existing diagonal removes it); a tile with furniture on it is left alone, mirroring Buy mode's occupied-tile check.

### Core simulation loop

1. `SimClock` converts real elapsed time into sim-minutes at the current speed (paused/1x/2x/3x).
2. Each `Sim` decays its motives (hunger, energy, bladder, hygiene, social, fun) every sim-minute, and steps whatever it's currently doing — walking a path, using an object, or socializing with another Sim.
3. `updateAI` runs an autonomy pass each tick: any idle Sim whose most urgent motive drops below a threshold will path to the nearest free object that satisfies it (or, for social, path to and start chatting with another idle Sim).
4. `IsoRenderer` redraws the lot every frame — floor tiles, then walls/objects/Sims painter-sorted back-to-front by grid depth.

### Room quality

Room is a seventh motive, but it doesn't decay like the others — `Sim.update` overwrites it every tick with `Lot.computeRoomScore(gridX, gridY)`, a direct read of the Sim's current surroundings rather than a need that drains over time. The score comes from the total `decorValue` of every object in the Sim's connected region (via `getRoomTiles`, doors and all): `clamp(0, 100, 10 + totalDecor * 1.2)`, so a bare room floors at 10 and a well-furnished one climbs toward 100 as you buy more (each `ObjectCatalog.ts` entry has its own `decorValue` — decorative pieces like a painting or plant score higher relative to their price than a plain fixture like a sink). Since it's folded into `MOTIVE_TYPES`, it counts toward overall mood the same as any other motive for free. Skipped while a Sim is `atWork`, since they're off the lot with no current room to reflect. With doors now bounding the flood-fill, this is a true per-room score — decorating one room no longer inflates a neighboring one just because a doorway connects them, so long as an actual door (not just a missing wall segment) separates them.

### Personality and relationships

Each Sim has a `Personality` (`game/Personality.ts`): five traits scored 0-10 — Neat, Outgoing, Active, Playful, Nice — loosely modeled on The Sims 1's own personality-point system (original gameplay numbers, not a copy). `TRAIT_FOR_MOTIVE` in `types.ts` maps a trait to the motive it modulates (Playful→fun, Outgoing→social, Neat→hygiene), so a highly playful Sim gets more out of watching TV than a serious one. Outgoing also shifts the AI's social urgency threshold in `AI.ts`, so outgoing Sims seek company well before it's dire and shy ones tolerate more isolation.

Each Sim tracks two scalars (-100..100) with every other Sim it's socialized with: a relationship (friendship) score, and a slower-building romance score. `game/Relationships.ts`'s `compatibility(a, b)` compares the two Sims' full trait profiles (-1 for polar-opposite personalities, 1 for identical ones) and directly scales relationship gain during a chat — so two very different Sims don't just become friends more slowly, they can genuinely drift toward dislike, even if one of them is high in Nice (Nice scales the intensity of the reaction, not which direction it goes). Romance only starts accruing once relationship has already crossed a friendship threshold, and only for a compatible pair — it doesn't happen between strangers or people who rub each other the wrong way. `relationshipLabel(relationship, romance)` turns the two scalars into a Sims-style tier — Enemy, Rival, Acquaintance, Friend, Best Friend, Crush, Sweetheart — shown next to each relationship bar in the HUD, color-coded per tier.

### Money and jobs

The household shares one `funds` balance (starting at §3,000), spent in Buy mode — each object in `ObjectCatalog.ts` has a `price`, and a placement is refused with a "Not enough funds" flash if the household can't afford it. `game/Job.ts` defines a handful of career tracks (Paper Route, Retail, Business, Science, Politics), each a list of `JobLevel`s with their own title, daily pay, and leave/return time. `game/Jobs.ts` runs every tick: any Sim on a track whose shift has started gets interrupted (whatever they were doing) and marked `atWork` — hidden from the lot entirely, since there's no actual workplace or commute animation, just the classic Sims abstraction of "they're gone for the day" — then reappears at quitting time with the day's pay added to the household funds. Jobs only run Monday-Friday (`WORK_DAYS` in `Job.ts`); weekends are automatically off.

Promotions and firing both run on the same return-from-work event: each Sim's motives (hunger, energy, hygiene, fun) are snapshotted into a 0-100 "performance" score the moment they *leave* for their shift — the Sims 1 idea that showing up well-rested, fed, and groomed is what gets you ahead — and that score scales how much `promotionProgress` gains toward the next level (a track's `daysToPromote` is roughly how many good days it takes at full performance). Hit 100% and the Sim levels up, resetting progress and firing a toast (`HUD.flashPromotion`) with their new title; the Sim panel's career section shows the live progress bar. A track's last level has `daysToPromote: 0` and simply caps out. On the flip side, two consecutive workdays with performance below a low threshold gets a Sim fired — their career resets to unemployed and a red toast (`HUD.flashFired`) breaks the news; one bad day alone doesn't put a job at risk, only stringing two together does. That first bad day isn't silent, either: `Jobs.getBadStreak(simId)` exposes the live streak, and the career section shows a "⚠️ one more bad day and they'll be fired" warning as soon as it hits 1, so there's a chance to improve the Sim's motives before the second shift seals it.

### Current simplifications (good first-contribution targets)

- **Diagonal walls consume a whole tile** — see Diagonal walls above; a real Sims diagonal only shaves off a triangular corner and leaves the rest of the tile walkable, but this project's walkability model is per-tile, not per-triangle, so a diagonal-walled tile is entirely off-limits rather than half-usable.
- **Doors are a plain toggle, not a placeable object** — no swing animation, no double doors or different door styles, and a door can only be laid over an existing wall rather than placed freestanding; a wall-less gap with no door still silently merges the rooms on either side, which is easy to do by accident when clearing a wall in Walls mode.
- **Still no sprite art** — object/Sim detail is procedural vector drawing (`ObjectArt.ts`), not sprite sheets: soft blurred contact shadows, a two-layer "glow" fake instead of real gradients (PixiJS's `FillGradient` allocates a GPU texture per instance, which isn't safe to recreate every frame the way this scene redraws), and rounded/capsule Sim bodies instead of flat boxes. It reads much less "voxel game" than flat blocks, but real hand-drawn isometric sprites would still be a big visual upgrade, especially for Sims.
- **Sim editing still can't touch household or relationships** — Edit covers name/color/personality, and Move now relocates a Sim to any floor tile (a teleport, cancelling whatever they were doing, including notifying a chat partner left mid-conversation), but there's still no way to change a Sim's household or edit relationships directly from the UI; a trait change also takes effect immediately, so a Sim mid-interaction under their old traits doesn't retroactively recompute anything already in progress.
- **Relationships have no memory of specific events** — friendship/romance are two running scalars plus a derived label (Friend, Enemy, Crush, etc.), not a log of moments; there's no "first kiss," no grudge from a specific bad interaction, and no family/household relationship types (spouse, sibling) at all — every pairing is scored by the same generic compatibility formula.
- **Save slots have no thumbnails** — the Saves modal shows each slot's last-saved time, Sim count, funds, and now supports renaming in place, but there's no visual preview of the lot; no export/import or cloud sync either.
- **No multi-lot / neighborhood view** — one lot, no traveling between lots.
- **Firing's streak is session-only, and nothing checks motives mid-shift** — the warning shows once a bad day has happened, but `badStreak` isn't persisted in save data (it's short-term bookkeeping, like `departurePerformance`), so reloading mid-streak forgets it; motives also keep decaying normally while a Sim is at work with nothing checking them until the next departure snapshot.

## Contributing

The architecture is intentionally small and decoupled — `engine/` has no game-specific knowledge, `game/` has no rendering knowledge, and `render/`/`ui/` only read state. Adding a new object is as simple as adding an entry to `ObjectCatalog.ts`; adding a new motive means touching `game/types.ts` and `Motives.ts`.
