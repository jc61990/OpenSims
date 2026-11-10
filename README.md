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
npm run serve    # serve an existing dist/ build (see scripts/serve.mjs)
```

## Deploying

OpenSims has no backend and no database — it's a static Vite build, and all game state lives in the player's browser (`localStorage`), so "deploying" just means serving `dist/` to the internet.

**On a Ubuntu (or other Debian-family) server**, `setup.sh` does it end to end: it asks a few questions (install directory, port, which user to run as), installs Node.js if it's missing, builds the app, and installs it as a systemd service (`opensims.service`) that starts on boot and restarts itself if it ever crashes.

```bash
git clone https://github.com/jc61990/OpenSims.git
cd OpenSims
sudo ./setup.sh          # interactive — press Enter to accept each default
# sudo ./setup.sh -y      # or accept every default with no prompts at all
```

The service itself is `scripts/serve.mjs` — a small dependency-free static file server (just `node:http`, no npm packages) that serves `dist/`. It's deliberately read-only (never writes anything, since there's nothing to persist server-side), which lets the systemd unit run it fully locked down: a dedicated unprivileged `opensims` system user, `ProtectSystem=strict`, `NoNewPrivileges=true`, no write access anywhere. Picking a port below 1024 (e.g. 80) is handled by granting just `CAP_NET_BIND_SERVICE` rather than running the whole thing as root.

Once installed:

```bash
systemctl status opensims     # is it running?
journalctl -u opensims -f     # follow its logs
systemctl restart opensims    # e.g. after a `git pull` + re-running setup.sh to rebuild
sudo ./uninstall.sh           # tear it all back down (asks before deleting anything)
```

`sudo ./setup.sh` is also how you deploy an update: `git pull` in the install directory, then re-run it — it rebuilds in place and restarts the service rather than failing on an existing install.

Anywhere else (or if you'd rather manage the process yourself), `npm run build` and point any static file server — nginx, Caddy, `npx serve dist`, GitHub Pages, Netlify, S3 — at the resulting `dist/` folder; nothing about the app assumes it's running under `scripts/serve.mjs` specifically.

## Controls

- **Drag** (or **touch-drag** on mobile) to pan the camera, **scroll** (or **pinch** on mobile) to zoom
- **Live mode**: click a Sim to select them and watch their motives in the bottom-left panel; **right-click** a Sim, pet, object, or floor tile for a command menu — see below
- **Buy mode**: pick an object from the palette, then click a floor tile to place it
- **Walls mode**: click near an edge of a tile to toggle a wall on that edge — walls live on tile boundaries, so a click is matched to whichever of the tile's 4 edges it landed closest to
- **Doors mode**: same edge-targeting as Walls mode, but turns an existing wall into a passable doorway (and back) instead of removing it outright — a door still separates rooms for scoring purposes, unlike just clearing the wall
- **Diagonals mode**: click a tile to place a diagonal wall across whichever of its two corners the click landed closer to (and click an existing one to remove it) — a diagonal consumes the whole tile (it's unwalkable, like furniture) rather than a true sub-tile cut; a tile with furniture on it is left alone
- **+ Sim mode**: opens a Create Sim modal (name, color, and the five personality trait sliders) — submitting it arms placement, then click an open floor tile to add them to the household; **Edit** in the Sim panel reopens the same modal prefilled with the selected Sim's current name/color/traits and applies changes in place (no re-placement needed); **Move** arms a single placement click that relocates the selected Sim to the clicked floor tile (a teleport, not a walk — the same invalid-tile-stays-armed behavior as + Sim's placement); **Remove** deletes the selected one
- Speed controls (`II`, `1x`, `2x`, `3x`) control simulation speed, matching the classic pause/play/fast-forward keys
- **Save** writes the current household to its active named slot (prompting for a name the first time); **Saves** opens a modal listing every saved household, each with its own Load/Rename/Delete, plus a "Save As" field to fork the current state into a new slot; **Reset** starts a fresh, unsaved household without touching anything already saved
- **Town** opens a shop modal for buying pets — each purchase deducts funds and places the new pet on an open tile of the home lot right away
- The **Career** section in the Sim panel assigns a job; the Sim automatically leaves for their shift and comes home with a paycheck
- **Neighborhood** opens a scrollable overview map of every house, including your own — drag/touch-drag to pan, scroll/pinch to zoom, click a house to visit it (swapping in that house's own Sims and lot; Build/Buy/Save and similar leave with you — see below); **Back Home** in the top bar returns to yours exactly as you left it

The starter household is Bella and Mortimer Goth, The Sims 1's iconic premade neighbors and, as in the source material, married to each other from the start, joined by Larry Lubin — the town's mayor, an original character with maxed-out Outgoing and rock-bottom Nice (he'll hunt down company the moment he's alone, and isn't pleasant once he's found it), already sitting at the top of the Politics career track (so he's usually off being mayor during business hours rather than standing around the lot). Sims added later draw from a pool of other classic-series first names.

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

Motive decay is deliberately slow (Sims 1 pacing), so a Sim can go realistic hours of sim-time between urgent needs — long enough that, left alone, they'd just stand frozen in place the whole time. `Sim.ts`'s own `stepIdle` fixes that the same way `Pet.ts` already did for pets: on a randomized timer (`IDLE_WANDER_INTERVAL_MINUTES`, re-rolled each time so a household doesn't wander in lockstep), an idle Sim with nothing actually urgent (`motives.mostUrgent()` still null) picks a nearby tile and strolls over using its normal `walkTo`. It's self-contained and runs before `updateAI` sees that Sim this tick, so if something genuinely urgent comes up at the same moment, `updateAI` just finds the Sim already walking (same as it would for a walk started for any other reason) and leaves it alone — the stroll never overrides real need-driven behavior, only fills the dead air around it.

### Day/night lighting and mood faces

Two purely visual touches, both reading state the simulation already tracks rather than adding any of their own. `render/DayNight.ts`'s `computeDayNightTint(minuteOfDay)` is a small, dependency-free, keyframed color interpolator — deep blue at night, warm orange at dawn/dusk, no tint at all through the main daylight hours — and `IsoRenderer` draws its result as a translucent rect on a stage-level layer (a sibling of the panned/zoomed world container, so the wash always covers exactly the viewport regardless of camera position) every frame, keyed off the live sim clock. Being pure and PixiJS-free, `computeDayNightTint` is unit-tested directly with no browser needed.

Each Sim's face also now has a mouth: `drawSim` draws a small quadratic curve whose curvature is driven by `sim.motives.mood` (already computed as the average of all seven motives) — a clear smile when things are going well, a flat line near neutral, and a frown when several needs are running low. It's a cheap read of existing data, not a new system: no new state, nothing to save, just a more expressive frame each render.

Walking also has a real stride now, not just a body bob. A Sim's two legs scissor fore/aft (`legStride`, the same `Math.sin(now / 90 + sim.id)` phase already driving the arm swing, applied as an opposite horizontal offset to each leg) instead of staying planted while the torso bobs over them. Pets get an equivalent four-leg diagonal trot — front-left paired with back-right, front-right with back-left, alternating which pair lifts — the simplified gait real quadrupeds use at a walk. Both are purely cosmetic, driven by `sim.state`/`pet.state` and wall-clock time exactly like the existing bob and arm swing were, so there's nothing new to save or get out of sync with simulated movement.

Sims chatting also do more than stand still under a busy-glow dot: while `sim.state === "socializing"`, `drawSim` layers a small head nod (`headBob`), a mouth flutter riding on top of the mood-based resting curve (`talkFlutter`), and a one-arm gesture (`talkGesture`, applied to whichever arm is already on the side the Sim is facing — i.e. toward their conversation partner) on top of the normal pose, each its own faster/differently-phased `Math.sin(now / … + sim.id * …)` so the two Sims in a conversation don't nod in lockstep. Like the walking stride, it's purely cosmetic and wall-clock-driven — nothing new to save.

Floors, walls, and Sim shirts also have real texture now, not flat color — generated in code rather than sourced from anywhere, the same "no external art" stance the project takes toward EA's actual Sims assets (see the top of this README). `render/Textures.ts` draws a handful of small, tileable, mostly-white canvas patterns once at startup (a speckled grain for floors, vertical grooves for wall paneling, a fine crosshatch for fabric) and wraps each in a repeat-addressed PixiJS `Texture`. Because a Graphics fill's `color` tints its `texture`'s sampled color rather than replacing it, one grayscale pattern works for every material color in the game — a purple carpet and a green one both get the same grain, just tinted differently — so no new per-color assets are needed as new floor/wall colors or Sim colors get added. `IsoDraw.ts`'s wall-drawing functions (`drawWallSegment`, `drawDoorway`) gained an optional trailing `texture` parameter threaded through to their fill calls; furniture (`drawBlock`, used by `ObjectArt.ts`) deliberately wasn't touched, so each object's own hand-tuned flat-color styling stays as designed.

### Mobile

OpenSims runs on a phone in two parts: a responsive layout and real touch input, not just "doesn't crash on a small screen."

Below an 820px-wide viewport (`style.css`), the sim panel and controls panel — side by side at their desktop widths on a laptop — switch to stacking full-width instead, each keeping its own internal scroll (so a long relationships/memories/career list never pushes the rest of the panel off-screen) inside an outer `.hud` that scrolls as a last resort. Buttons get a bit more padding for tapping accuracy, and the touch-first browser chrome gets turned off at the page level (`touch-action: manipulation`, `overscroll-behavior: none`) so double-tap-zoom and pull-to-refresh don't fight the game.

Panning already worked on touch for free — the canvas uses Pointer Events throughout, which unify mouse/touch/pen — but zooming didn't, since it only ever listened for a scroll wheel. `IsoRenderer` now tracks every active pointer in a map: a second touch point turns what would've been a pan into a pinch, zooming toward the midpoint between the two fingers via `render/Camera.ts`'s `zoomCameraTo` — the same anchor-preserving zoom math the wheel handler uses, extracted once so both input paths share it (and so it's unit-testable without a browser: given a camera state, an anchor point, and a target scale, it returns the new camera state that keeps the anchor's world-space point fixed on screen). One finger lifting out of a pinch resumes a plain pan from wherever that finger still is, rather than ending the gesture outright.

### Room quality

Room is a seventh motive, but it doesn't decay like the others — `Sim.update` overwrites it every tick with `Lot.computeRoomScore(gridX, gridY)`, a direct read of the Sim's current surroundings rather than a need that drains over time. The score comes from the total `decorValue` of every object in the Sim's connected region (via `getRoomTiles`, doors and all): `clamp(0, 100, 10 + totalDecor * 1.2)`, so a bare room floors at 10 and a well-furnished one climbs toward 100 as you buy more (each `ObjectCatalog.ts` entry has its own `decorValue` — decorative pieces like a painting or plant score higher relative to their price than a plain fixture like a sink). Since it's folded into `MOTIVE_TYPES`, it counts toward overall mood the same as any other motive for free. Skipped while a Sim is `atWork`, since they're off the lot with no current room to reflect. With doors now bounding the flood-fill, this is a true per-room score — decorating one room no longer inflates a neighboring one just because a doorway connects them, so long as an actual door (not just a missing wall segment) separates them.

### Personality and relationships

Each Sim has a `Personality` (`game/Personality.ts`): five traits scored 0-10 — Neat, Outgoing, Active, Playful, Nice — loosely modeled on The Sims 1's own personality-point system (original gameplay numbers, not a copy). `TRAIT_FOR_MOTIVE` in `types.ts` maps a trait to the motive it modulates (Playful→fun, Outgoing→social, Neat→hygiene), so a highly playful Sim gets more out of watching TV than a serious one. Outgoing also shifts the AI's social urgency threshold in `AI.ts`, so outgoing Sims seek company well before it's dire and shy ones tolerate more isolation.

Each Sim tracks two scalars (-100..100) with every other Sim it's socialized with: a relationship (friendship) score, and a slower-building romance score. `game/Relationships.ts`'s `compatibility(a, b)` compares the two Sims' full trait profiles (-1 for polar-opposite personalities, 1 for identical ones) and directly scales relationship gain during a chat — so two very different Sims don't just become friends more slowly, they can genuinely drift toward dislike, even if one of them is high in Nice (Nice scales the intensity of the reaction, not which direction it goes). Romance only starts accruing once relationship has already crossed a friendship threshold, and only for a compatible pair — it doesn't happen between strangers or people who rub each other the wrong way. `relationshipLabel(relationship, romance)` turns the two scalars into a Sims-style tier — Enemy, Rival, Acquaintance, Friend, Best Friend, Crush, Sweetheart — shown next to each relationship bar in the HUD, color-coded per tier.

On top of that, each pair can also carry a fixed `FamilyRelation` (none/spouse/sibling/parent/child), set explicitly from a dropdown under each relationship row rather than derived from behavior — a definitive household tie, not a mood. Setting one side sets the other automatically (`main.ts`'s `setFamilyRelation`, via `inverseFamilyRelation`): spouse and sibling are their own inverse, parent and child are each other's. When a family tie is set, its label (Spouse, Sibling, Parent, Child) replaces the emotional tier in the HUD — a spouse is a spouse regardless of how today's friendship number is doing — though the underlying relationship/romance scalars keep tracking the quality of the relationship underneath. A sibling or parent/child tie also blocks romance from accruing between that pair at all, however compatible their personalities are (spouses are exempt, since they already have it); Bella and Mortimer Goth start the game married to each other.

Each Sim also keeps a short **Memories** log (`sim.memories`, shown in its own panel section) — a newest-first list of one-line flavor text for each chat it's had, from its own point of view. `Sim.startSocializing` snapshots the relationship/romance scalars for that partner; `stopSocializing` compares against the snapshot and hands both the before/after `relationshipLabel` tiers and the raw relationship delta to `Relationships.describeChatMemory`, which prioritizes a tier crossing ("Became friends with Mortimer Goth.", "The spark faded with Larry Lubin.") over the plainer delta-based wording ("Had a nice chat with...", "Clashed with...") it falls back to when the chat didn't cross a tier. The log is capped at 12 entries per Sim (oldest dropped first) and persists with the save; an interrupted chat (Sim removed, moved, or otherwise cut short mid-conversation) still records whatever happened before the cut.

### Money and jobs

The household shares one `funds` balance (starting at §3,000), spent in Buy mode — each object in `ObjectCatalog.ts` has a `price`, and a placement is refused with a "Not enough funds" flash if the household can't afford it. `game/Job.ts` defines a handful of career tracks (Paper Route, Retail, Business, Science, Politics), each a list of `JobLevel`s with their own title, daily pay, and leave/return time. `game/Jobs.ts` runs every tick: any Sim on a track whose shift has started gets interrupted (whatever they were doing) and marked `atWork` — hidden from the lot entirely, since there's no actual workplace or commute animation, just the classic Sims abstraction of "they're gone for the day" — then reappears at quitting time with the day's pay added to the household funds. Jobs only run Monday-Friday (`WORK_DAYS` in `Job.ts`); weekends are automatically off.

Promotions and firing both run on the same return-from-work event: each Sim's motives (hunger, energy, hygiene, fun) are snapshotted into a 0-100 "performance" score the moment they *leave* for their shift — the Sims 1 idea that showing up well-rested, fed, and groomed is what gets you ahead — and that score scales how much `promotionProgress` gains toward the next level (a track's `daysToPromote` is roughly how many good days it takes at full performance). Hit 100% and the Sim levels up, resetting progress and firing a toast (`HUD.flashPromotion`) with their new title; the Sim panel's career section shows the live progress bar. A track's last level has `daysToPromote: 0` and simply caps out. On the flip side, two consecutive workdays with performance below a low threshold gets a Sim fired — their career resets to unemployed and a red toast (`HUD.flashFired`) breaks the news; one bad day alone doesn't put a job at risk, only stringing two together does. That first bad day isn't silent, either: `Jobs.getBadStreak(simId)` exposes the live streak, and the career section shows a "⚠️ one more bad day and they'll be fired" warning as soon as it hits 1, so there's a chance to improve the Sim's motives before the second shift seals it.

### Town and pets

The **Town** button opens a shop modal (`HUD.ts`'s `buildTownModal`) listing purchasable pets from `game/PetCatalog.ts` — currently Dog (§150) and Cat (§120), each with its own name pool a new pet's name is randomly drawn from. Buying one deducts its price from the household's `funds` (refused with the same "Not enough funds" flash Buy mode uses if the household can't afford it) and instantly places it on a random open, walkable tile of the home lot — there's no placement-click step like furniture or Sims get, since a pet doesn't need a deliberate spot.

`game/Pet.ts`'s `Pet` is deliberately a much lighter entity than `Sim`: no motives, no jobs, just a position and a wander habit (plus the ability to be petted — see below). On an idle timer (randomized per-pet so a household of pets doesn't all move in lockstep) it picks a nearby tile and walks there using the same `findPath`/`canMove` pathfinding Sims use, so it naturally routes around walls and furniture; if a wall goes up mid-walk and blocks its path, it just stops and goes back to idle rather than replanning. `IsoRenderer.ts` draws pets with their own small procedural sprite (body, tail, head, and type-specific ears — pointy for cats, droopy for dogs) and a name label, depth-sorted into the same scene as Sims and objects. Pets save and load with the household (`SaveGame.ts`'s `pets`/`nextPetId` fields, both optional so older saves without pets still load cleanly).

Pets aren't purely decorative: when a Sim's Fun motive is the most urgent need, `AI.ts`'s `tryPetNearby` has them check for a free, idle pet before falling back to furniture — if one's nearby, the Sim walks over and starts petting it (`Sim.startPetting`), gaining Fun (scaled by the Playful trait, same as other fun interactions) and a smaller Social bump for a fixed duration, with the same busy-glow indicator shown for using an object or chatting. A pet being petted holds still (`occupiedBy` on `Pet`, mirroring the `GameObject` occupancy pattern) and can't be claimed by a second Sim until released, whether that's from the session running its course or the Sim being interrupted mid-pet.

### Right-click commands

Everything above happens autonomously — the AI decides what a Sim does next. Right-click gives the player a say: it opens a small menu (`HUD.ts`'s `openContextMenu`, a plain fixed-position panel built once and repositioned/repopulated per click, closed on an outside click, a right-click elsewhere, Escape, or picking an item) whose contents depend on what was right-clicked, resolved by `IsoRenderer.ts`'s `resolveContextTarget` in priority order — a Sim, then a pet, then whatever object occupies that exact tile, then the bare tile:

- **A Sim who isn't the selected one**: "Select `name`" (the same selection a left-click gives) and "Talk to `name`".
- **The currently-selected Sim**: just "Cancel" — right-clicking yourself interrupts whatever you're doing, the same self-targeting convention real Sims games use.
- **A pet**: "Pet `name`".
- **An object with an interaction**: one item per interaction (every current object has at most one); a purely decorative object with none opens no menu at all.
- **An empty, walkable tile**: "Walk Here", a direct move command.

Picking an item always acts on whichever Sim is currently selected, via `game/Commands.ts` — `commandUseObject`, `commandSocialize`, `commandPet`, `commandWalkTo`. These mirror `AI.ts`'s autonomous `tryUseObject`/`tryStartSocial`/`tryPetNearby` closely (same pathfinding, same occupancy checks, `findAdjacentWalkable` is shared by both), but with one deliberate difference: a command always calls `sim.interrupt()` first, so it overrides whatever the Sim was already doing, where the AI only ever acts on an already-idle Sim. `commandSocialize` interrupts the target too, once the selected Sim actually arrives next to them — calling someone over to chat means they stop what *they* were doing as well.

Mechanically, right-click needed its own path through `IsoRenderer`'s pointer handling: the pan/pinch/click logic now ignores any non-primary mouse button (`e.pointerType === "mouse" && e.button !== 0`) so a right-click can't also start a camera drag or fire the ordinary tile-click a left-click would, and a separate `contextmenu` listener (`e.preventDefault()`'d, so the browser's native menu never appears) does the hit-test and calls back into `main.ts` with what was clicked and where.

### Neighborhood

There's more than one house, and a real map to get to them from. The **Neighborhood** button (top-right) opens a second, separate scene — `render/NeighborhoodRenderer.ts` — a scrollable isometric town: streets, a handful of cars animated back and forth along them, and every house as its own small building with a distinctly colored roof and name label, including the player's own. This is deliberately the real Sims 1 shape: a map you step into a house *from*, rather than one giant lot everyone shares. Clicking a house swaps in that house's own small, lightly-furnished lot and Sims (`game/Neighborhood.ts`'s `buildNeighborhood` — Hart, Okafor, Castillo, Whitfield; invented names and personalities, not a reproduction of any actual Sims 1 families), exactly as if you'd loaded a different save.

The map reuses the main game's isometric toolkit rather than inventing a second one — `IsoMath.gridToScreen`, `IsoDraw`'s `fillPoly`/`shade`, the same drag-to-pan/pinch-to-zoom/wheel-zoom pointer handling as `IsoRenderer` (copied rather than shared, since the two renderers' hit-testing needs are different enough — Sims/objects/tiles vs. just houses — that factoring out a common base felt like more indirection than the ~70 lines of pointer code were worth). Houses are drawn as one multi-tile gabled box each (not a per-tile quilt of cubes like furniture) using the same corner-and-face-fill technique `IsoDraw`'s block helpers use internally, just inlined for a footprint bigger than one tile. Roads are plain tinted tiles with dashed centerlines; cars are small tiles-space rectangles that ping-pong back and forth along a road at their own period and phase (so they don't all move in lockstep), projected through `gridToScreen` as fractional grid positions — getting the correct isometric skew for free from the same math everything else on the map uses. `game/Neighborhood.ts`'s `buildNeighborhoodMapLayout` is the one thing tying it to the game's actual house data: it takes `buildNeighborhood`'s neighbor list (for their names) plus the home household's own name and produces a small, render-only list of `{id, name, gx, gy, roofColor}` — the live Lot/Sim/Pet data stays owned by `main.ts`'s `houseCache`, same as before.

Architecturally, `main.ts` holds `lot`/`sims`/`pets` as plain reassignable (`let`) bindings rather than one fixed household forever — a `houseCache` (home plus every neighbor, all built once at startup) maps a house id to its own `{ lot, sims, pets }`, and `enterHouse(id)` just repoints those three bindings at a different entry and calls `IsoRenderer.setLot` (the one piece the renderer couldn't already pick up live — `sims`/`pets` were already read through getters passed to `init`, so reassigning them was free). Neighbor Sim/pet ids are drawn from a block (10,000+) well above anything the player's own household reaches, so the two id spaces can never collide.

This is where the "simple scenery" design shows: the game loop only ever ticks whichever `sims`/`pets`/`lot` are *currently* assigned, so a house nobody is looking at simply doesn't advance — no needs decay, no AI, nothing to catch up on. Leaving a neighbor's house mid-visit and coming back later finds them exactly as they were; coming home finds your own household exactly as *it* was, however long you were away. Careers are gated the same way (`activeHouseId === "home"` around the `updateJobs` call in the ticker) — neighbor Sims aren't a second economy, so a neighbor's career section is hidden entirely rather than sitting there doing nothing. Build/Buy/Doors/Diagonals/+Sim/Save/Saves/Town and the Sim panel's Edit/Move/Remove all hide the same way while visiting (`HUD.setActiveHouse`) — none of them make sense on a house that isn't yours — while Live-mode interaction (selecting a Sim, right-click Select/Talk-to/Walk-here/Use) keeps working normally, since it's just as harmless there as it is at home.

Neighbor houses aren't saved — they're rebuilt fresh (same households, freshly-idle Sims) every time the page loads, the same way a fresh starter household appears with no active save slot. Giving them their own persistence, a bigger/denser map, or letting the player's own Sims walk over and socialize with a neighbor's (rather than just looking in) are the natural next steps.

### Current simplifications (good first-contribution targets)

- **Diagonal walls consume a whole tile** — see Diagonal walls above; a real Sims diagonal only shaves off a triangular corner and leaves the rest of the tile walkable, but this project's walkability model is per-tile, not per-triangle, so a diagonal-walled tile is entirely off-limits rather than half-usable.
- **Doors are a plain toggle, not a placeable object** — no swing animation, no double doors or different door styles, and a door can only be laid over an existing wall rather than placed freestanding; a wall-less gap with no door still silently merges the rooms on either side, which is easy to do by accident when clearing a wall in Walls mode.
- **Still no sprite art** — object/Sim detail is procedural vector drawing (`ObjectArt.ts`), not sprite sheets: soft blurred contact shadows, a two-layer "glow" fake instead of real gradients (PixiJS's `FillGradient` allocates a GPU texture per instance, which isn't safe to recreate every frame the way this scene redraws), and rounded/capsule Sim bodies instead of flat boxes. It reads much less "voxel game" than flat blocks, and a day/night tint, a mood-driven mouth, a real walking stride, and procedural floor/wall/fabric textures (see above) all add atmosphere and detail on top, but real hand-drawn isometric sprites — different hairstyles, outfits, skin tones independent of a Sim's assigned color, actual furniture texture rather than flat color — would still be a big visual upgrade.
- **Sim editing still can't touch household or relationships** — Edit covers name/color/personality, and Move now relocates a Sim to any floor tile (a teleport, cancelling whatever they were doing, including notifying a chat partner left mid-conversation), but there's still no way to change a Sim's household or edit relationships directly from the UI; a trait change also takes effect immediately, so a Sim mid-interaction under their old traits doesn't retroactively recompute anything already in progress.
- **Memories are flavor text, not a real event log** — each Sim now logs a one-line summary of every chat (see Personality and relationships above), but it's generated from the net before/after change, not from anything that happened mid-conversation; there's no "first kiss," no grudge tied to one specific bad interaction, and nothing but chats generate a memory at all (no milestone entries for a promotion, a new pet, or a family tie being set).
- **Save slots have no thumbnails** — the Saves modal shows each slot's last-saved time, Sim count, funds, and now supports renaming in place, but there's no visual preview of the lot; no export/import or cloud sync either.
- **Neighbor houses are look-but-don't-touch, and don't persist** — see Neighborhood above; visiting shows a neighbor's own Sims living their own autonomous lives, but your own household can't walk over and visit them in person (there's no cross-lot travel, just switching which lot is on screen), and reloading the page regenerates fresh neighbors from scratch rather than remembering anything that happened on a previous visit.
- **Pets still have no needs of their own** — a Sim can pet one for a Fun/Social boost, but a `Pet` itself has no hunger or happiness to manage, can't be fed or trained, and can't be renamed, sold, or removed once bought; only one direct interaction (petting) exists, versus the handful real Sims pets support.
- **Firing's streak is session-only, and nothing checks motives mid-shift** — the warning shows once a bad day has happened, but `badStreak` isn't persisted in save data (it's short-term bookkeeping, like `departurePerformance`), so reloading mid-streak forgets it; motives also keep decaying normally while a Sim is at work with nothing checking them until the next departure snapshot.
- **Right-click commands have no touch equivalent yet** — on mobile there's no long-press gesture mapped to open the same menu, so the command system (see above) is desktop/mouse-only for now; touch users still get full autonomous AI and pan/pinch, just not direct commands.

## Contributing

The architecture is intentionally small and decoupled — `engine/` has no game-specific knowledge, `game/` has no rendering knowledge, and `render/`/`ui/` only read state. Adding a new object is as simple as adding an entry to `ObjectCatalog.ts`; adding a new motive means touching `game/types.ts` and `Motives.ts`.
