import "./style.css";
import { Lot } from "./game/Lot.ts";
import { Sim } from "./game/Sim.ts";
import { Pet, type PetType } from "./game/Pet.ts";
import { PET_CATALOG, randomPetName } from "./game/PetCatalog.ts";
import { Personality, randomPersonality } from "./game/Personality.ts";
import { GameObject } from "./game/GameObject.ts";
import { OBJECT_CATALOG } from "./game/ObjectCatalog.ts";
import { updateAI } from "./game/AI.ts";
import { updateJobs } from "./game/Jobs.ts";
import { SimClock } from "./engine/Clock.ts";
import { IsoRenderer } from "./render/IsoRenderer.ts";
import { HUD, formatMoney, type Mode, type NewSimData } from "./ui/HUD.ts";
import { SIM_COLOR_POOL, TRAIT_TYPES } from "./game/types.ts";
import { inverseFamilyRelation, type FamilyRelation } from "./game/Relationships.ts";
import {
  saveToSlot,
  loadFromSlot,
  deleteSaveSlot,
  renameSaveSlot,
  getLastActiveSlot,
  setLastActiveSlot,
  deserializeLot,
  deserializeSims,
  deserializePets,
} from "./game/SaveGame.ts";

const LOT_WIDTH = 14;
const LOT_HEIGHT = 14;
const STARTING_FUNDS = 3000;

const SIM_NAME_POOL = ["Bella", "Mortimer", "Cassandra", "Michael", "Dudley", "Kaylynn", "Bob", "Ivy"];

function nameForId(id: number): string {
  const base = SIM_NAME_POOL[(id - 1) % SIM_NAME_POOL.length];
  const loop = Math.floor((id - 1) / SIM_NAME_POOL.length);
  return loop > 0 ? `${base} ${loop + 1}` : base;
}

function colorForId(id: number): number {
  return SIM_COLOR_POOL[(id - 1) % SIM_COLOR_POOL.length];
}

// Build mode toggles a wall on whichever of the clicked tile's 4 edges the
// click landed closest to (fracX/fracY are the click's position within the
// tile, 0-1 each): west/east from how far across, north/south from how far
// down.
function toggleNearestWall(lot: Lot, gx: number, gy: number, fracX: number, fracY: number): void {
  if (!lot.inBounds(gx, gy)) return;
  const distances: [() => void, number][] = [
    [() => lot.setVWall(gx, gy, !lot.getVWall(gx, gy)), fracX],
    [() => lot.setVWall(gx + 1, gy, !lot.getVWall(gx + 1, gy)), 1 - fracX],
    [() => lot.setHWall(gx, gy, !lot.getHWall(gx, gy)), fracY],
    [() => lot.setHWall(gx, gy + 1, !lot.getHWall(gx, gy + 1)), 1 - fracY],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  distances[0][0]();
}

// Doors mode: same nearest-edge targeting as Walls mode, but toggles an
// edge between a solid wall and a passable-but-room-separating door instead
// of between wall and open air. A door can only be placed where a wall
// already stands (and clicking a standing door puts the wall back) — an
// edge with neither is left alone, since a door needs a frame to hang in.
function toggleNearestDoor(lot: Lot, gx: number, gy: number, fracX: number, fracY: number): void {
  if (!lot.inBounds(gx, gy)) return;
  const edges: [
    { hasWall: () => boolean; hasDoor: () => boolean; setWall: (v: boolean) => void; setDoor: (v: boolean) => void },
    number,
  ][] = [
    [
      {
        hasWall: () => lot.getVWall(gx, gy),
        hasDoor: () => lot.getVDoor(gx, gy),
        setWall: (v) => lot.setVWall(gx, gy, v),
        setDoor: (v) => lot.setVDoor(gx, gy, v),
      },
      fracX,
    ],
    [
      {
        hasWall: () => lot.getVWall(gx + 1, gy),
        hasDoor: () => lot.getVDoor(gx + 1, gy),
        setWall: (v) => lot.setVWall(gx + 1, gy, v),
        setDoor: (v) => lot.setVDoor(gx + 1, gy, v),
      },
      1 - fracX,
    ],
    [
      {
        hasWall: () => lot.getHWall(gx, gy),
        hasDoor: () => lot.getHDoor(gx, gy),
        setWall: (v) => lot.setHWall(gx, gy, v),
        setDoor: (v) => lot.setHDoor(gx, gy, v),
      },
      fracY,
    ],
    [
      {
        hasWall: () => lot.getHWall(gx, gy + 1),
        hasDoor: () => lot.getHDoor(gx, gy + 1),
        setWall: (v) => lot.setHWall(gx, gy + 1, v),
        setDoor: (v) => lot.setHDoor(gx, gy + 1, v),
      },
      1 - fracY,
    ],
  ];
  edges.sort((a, b) => a[1] - b[1]);
  const edge = edges[0][0];
  if (edge.hasWall()) {
    edge.setWall(false);
    edge.setDoor(true);
  } else if (edge.hasDoor()) {
    edge.setDoor(false);
    edge.setWall(true);
  }
}

// Diagonals mode: clicking a tile with no diagonal yet places whichever of
// its two diagonals (nwse or nesw) the click landed closer to; clicking a
// tile that already has one removes it. A tile with furniture on it is left
// alone — same "can't place onto an occupied tile" rule Buy mode follows —
// since a diagonal wall consumes the whole tile (see Lot.isWalkableTile).
function toggleDiagonal(lot: Lot, gx: number, gy: number, fracX: number, fracY: number): void {
  if (!lot.inBounds(gx, gy) || lot.objectAt(gx, gy)) return;
  if (lot.getDiagonal(gx, gy) !== "none") {
    lot.setDiagonal(gx, gy, "none");
    return;
  }
  const distNwse = Math.abs(fracX - fracY);
  const distNesw = Math.abs(fracX - (1 - fracY));
  lot.setDiagonal(gx, gy, distNwse <= distNesw ? "nwse" : "nesw");
}

// A single interior wall spans the full width at row-boundary 7, splitting
// the lot into a top half (kitchen, living room) and bottom half (corridor,
// bedroom, bathroom), with three doorways. Real edge walls have zero
// thickness, so every tile — including the ones the wall runs along — stays
// usable floor; nothing is "consumed" by the wall the way a tile-filling
// wall would. The three openings are real doors (not just missing wall
// segments), so each side still scores as its own room.
function createStarterLot(): Lot {
  const lot = new Lot(LOT_WIDTH, LOT_HEIGHT);

  for (let x = 0; x < LOT_WIDTH; x++) lot.setHWall(x, 7, true);
  for (const doorX of [3, 7, 10]) {
    lot.setHWall(doorX, 7, false);
    lot.setHDoor(doorX, 7, true);
  }

  lot.setFloorRect(1, 1, 6, 6, 0x7a8f74); // kitchen: sage tile
  lot.setFloorRect(8, 1, 13, 6, 0x8a6a4a); // living room: warm wood
  lot.setFloorRect(1, 8, 6, 13, 0x6a5a7a); // bedroom: plum carpet
  lot.setFloorRect(8, 8, 13, 13, 0x5a8a8a); // bathroom: aqua tile

  const place = (type: string, x: number, y: number) => {
    lot.addObject(new GameObject(OBJECT_CATALOG[type], x, y));
  };

  // Kitchen (top-left)
  place("fridge", 2, 2);
  place("counter", 4, 2);
  place("sink", 2, 5);

  // Living room (top-right)
  place("tv", 9, 2);
  place("sofa", 11, 2);
  place("stereo", 9, 5);
  place("painting", 12, 2);

  // Bedroom (bottom-left)
  place("bed", 2, 9);
  place("bed", 5, 9);
  place("dresser", 2, 11);
  place("bookshelf", 5, 11);

  // Bathroom (bottom-right)
  place("shower", 9, 9);
  place("toilet", 11, 9);
  place("sink", 9, 11);
  place("plant", 12, 11);

  return lot;
}

// Bella and Mortimer Goth are The Sims 1's iconic premade neighbors — a
// recognizable starter household, distinct from the generic first-name pool
// used for townsfolk added later via "+ Sim". Their personalities are just
// original gameplay numbers loosely flavored to match their vibe (social
// butterfly vs. tidy homebody) — not a reproduction of anything from the
// actual games.
//
// Larry Lubin, the town's mayor, rounds out the household's third slot:
// sky-high Outgoing (he knows absolutely everyone) paired with middling
// Nice and high Neat — a fussy, opinionated, can't-let-a-small-thing-go
// personality profile, the "lovably exasperating" type. He starts already
// at the top of the Politics career track, since he's the mayor, not
// working his way up to it.
function createStarterSims(): Sim[] {
  const bella = new Personality({ neat: 5, outgoing: 8, active: 5, playful: 7, nice: 6 });
  const mortimer = new Personality({ neat: 8, outgoing: 3, active: 4, playful: 4, nice: 6 });
  const larry = new Personality({ neat: 7, outgoing: 9, active: 4, playful: 6, nice: 3 });
  const bellaGoth = new Sim(1, "Bella Goth", colorForId(1), 7, 6, bella);
  const mortimerGoth = new Sim(2, "Mortimer Goth", colorForId(2), 7, 8, mortimer);
  bellaGoth.setFamilyRelationRaw(mortimerGoth.id, "spouse");
  mortimerGoth.setFamilyRelationRaw(bellaGoth.id, "spouse");
  const larryLubin = new Sim(3, "Larry Lubin", colorForId(3), 11, 5, larry);
  larryLubin.careerId = "politics";
  larryLubin.careerLevel = 2; // Mayor — top of the Politics track
  return [bellaGoth, mortimerGoth, larryLubin];
}

async function main(): Promise<void> {
  const appRoot = document.getElementById("app")!;
  const canvasHolder = document.createElement("div");
  canvasHolder.id = "game-canvas-holder";
  appRoot.appendChild(canvasHolder);

  let activeSlotName = getLastActiveSlot();
  const saveData = activeSlotName ? loadFromSlot(activeSlotName) : null;
  if (activeSlotName && !saveData) activeSlotName = null; // slot vanished (e.g. deleted elsewhere)
  const lot = saveData ? deserializeLot(saveData) : createStarterLot();
  const sims: Sim[] = saveData ? deserializeSims(saveData) : createStarterSims();
  let nextSimId = saveData ? saveData.nextSimId : sims.length + 1;
  let funds = saveData ? (saveData.funds ?? STARTING_FUNDS) : STARTING_FUNDS;
  const pets: Pet[] = saveData ? deserializePets(saveData) : [];
  let nextPetId = saveData ? (saveData.nextPetId ?? 1) : 1;

  let selectedSimId: number | null = sims[0]?.id ?? null;
  let mode: Mode = "live";
  let activePaletteType: string | null = null;
  let pendingNewSim: NewSimData | null = null;
  let pendingMoveSimId: number | null = null;

  const clock = new SimClock();
  const renderer = new IsoRenderer();

  function setMode(m: Mode): void {
    mode = m;
    hud.setMode(m);
  }

  function removeSim(sim: Sim): void {
    if (sims.length <= 1) return;
    for (const other of sims) {
      if (other !== sim && other.socialPartner === sim) other.interrupt();
    }
    sim.interrupt();
    const idx = sims.indexOf(sim);
    if (idx >= 0) sims.splice(idx, 1);
    if (selectedSimId === sim.id) {
      selectedSimId = sims[0]?.id ?? null;
      renderer.selectedSimId = selectedSimId;
    }
    hud.renderSimTabs(sims, selectedSimId);
  }

  function setFamilyRelation(simA: Sim, simB: Sim, relation: FamilyRelation): void {
    simA.setFamilyRelationRaw(simB.id, relation);
    simB.setFamilyRelationRaw(simA.id, inverseFamilyRelation(relation));
  }

  function randomOpenTile(): { x: number; y: number } | null {
    const candidates: { x: number; y: number }[] = [];
    for (let y = 0; y < lot.height; y++) {
      for (let x = 0; x < lot.width; x++) {
        if (lot.isWalkableTile(x, y)) candidates.push({ x, y });
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function buyPet(type: PetType): void {
    const def = PET_CATALOG[type];
    if (funds < def.price) {
      hud.flashBuyStatus("Not enough funds");
      return;
    }
    const tile = randomOpenTile();
    if (!tile) {
      hud.flashBuyStatus("No room on the lot");
      return;
    }
    funds -= def.price;
    hud.setFunds(funds);
    pets.push(new Pet(nextPetId++, randomPetName(type), type, def.color, tile.x, tile.y));
    hud.flashBuyStatus(`-${formatMoney(def.price)}`);
  }

  const hud = new HUD(appRoot, {
    onSpeedChange: (speed) => {
      clock.speed = speed;
      hud.setSpeed(speed);
    },
    onModeChange: (m) => setMode(m),
    onPaletteSelect: (type) => {
      activePaletteType = type;
    },
    onSelectSim: (id) => {
      selectedSimId = id;
      renderer.selectedSimId = id;
      hud.renderSimTabs(sims, selectedSimId);
    },
    onRemoveSim: () => {
      const sim = sims.find((s) => s.id === selectedSimId);
      if (sim) removeSim(sim);
    },
    onMoveSim: () => {
      if (selectedSimId === null) return;
      pendingMoveSimId = selectedSimId;
      setMode("movesim");
    },
    onSetFamilyRelation: (simId, otherId, relation) => {
      const sim = sims.find((s) => s.id === simId);
      const other = sims.find((s) => s.id === otherId);
      if (!sim || !other) return;
      setFamilyRelation(sim, other, relation);
      hud.renderSim(sim, sims);
    },
    onSave: () => {
      if (!activeSlotName) {
        const name = window.prompt("Name this household:", "My Household")?.trim();
        if (!name) return;
        activeSlotName = name;
      }
      saveToSlot(activeSlotName, lot, sims, nextSimId, funds, pets, nextPetId);
      setLastActiveSlot(activeSlotName);
      hud.setActiveSlotName(activeSlotName);
    },
    onResetSave: () => {
      setLastActiveSlot(null);
      window.location.reload();
    },
    onSaveAs: (name) => {
      activeSlotName = name;
      saveToSlot(name, lot, sims, nextSimId, funds, pets, nextPetId);
      setLastActiveSlot(name);
      hud.setActiveSlotName(name);
    },
    onLoadSlot: (name) => {
      setLastActiveSlot(name);
      window.location.reload();
    },
    onDeleteSlot: (name) => {
      deleteSaveSlot(name);
      if (name === activeSlotName) {
        activeSlotName = null;
        setLastActiveSlot(null);
        hud.setActiveSlotName(null);
      }
    },
    onRenameSlot: (oldName, newName) => {
      const renamed = renameSaveSlot(oldName, newName);
      if (renamed && oldName === activeSlotName) {
        activeSlotName = newName;
        hud.setActiveSlotName(newName);
      }
      return renamed;
    },
    onSetCareer: (careerId) => {
      const sim = sims.find((s) => s.id === selectedSimId);
      if (!sim) return;
      sim.setCareer(careerId);
      hud.renderSim(sim, sims);
    },
    onCreateSim: (data) => {
      pendingNewSim = data;
      setMode("addsim");
    },
    onEditSim: (simId, data) => {
      const sim = sims.find((s) => s.id === simId);
      if (!sim) return;
      sim.name = data.name;
      sim.color = data.color;
      for (const t of TRAIT_TYPES) {
        const value = data.personality[t];
        if (value !== undefined) sim.personality.set(t, value);
      }
      hud.renderSimTabs(sims, selectedSimId);
      hud.renderSim(sim, sims);
    },
    onBuyPet: (type) => buyPet(type),
  });

  hud.setMode(mode);
  hud.setSpeed(clock.speed);
  hud.setFunds(funds);
  hud.setActiveSlotName(activeSlotName);
  hud.renderSimTabs(sims, selectedSimId);

  await renderer.init(canvasHolder, lot, () => sims, () => pets, {
    onTileClick: (gx, gy, fracX, fracY) => {
      if (mode === "build") {
        toggleNearestWall(lot, gx, gy, fracX, fracY);
      } else if (mode === "doors") {
        toggleNearestDoor(lot, gx, gy, fracX, fracY);
      } else if (mode === "diagonals") {
        toggleDiagonal(lot, gx, gy, fracX, fracY);
      } else if (mode === "buy") {
        if (!activePaletteType) return;
        const def = OBJECT_CATALOG[activePaletteType];
        if (!def) return;
        if (funds < def.price) {
          hud.flashBuyStatus("Not enough funds");
          return;
        }
        const placed = lot.addObject(new GameObject(def, gx, gy));
        if (placed) {
          funds -= def.price;
          hud.setFunds(funds);
          hud.flashBuyStatus(`-${formatMoney(def.price)}`);
        }
      } else if (mode === "addsim") {
        if (!lot.isWalkableTile(gx, gy)) return;
        const id = nextSimId++;
        const sim = pendingNewSim
          ? new Sim(id, pendingNewSim.name, pendingNewSim.color, gx, gy, new Personality(pendingNewSim.personality))
          : new Sim(id, nameForId(id), colorForId(id), gx, gy, randomPersonality());
        pendingNewSim = null;
        sims.push(sim);
        selectedSimId = sim.id;
        renderer.selectedSimId = sim.id;
        hud.renderSimTabs(sims, selectedSimId);
        setMode("live");
      } else if (mode === "movesim") {
        const sim = sims.find((s) => s.id === pendingMoveSimId);
        if (!sim) {
          pendingMoveSimId = null;
          setMode("live");
          return;
        }
        if (!lot.isWalkableTile(gx, gy)) return;
        for (const other of sims) {
          if (other !== sim && other.socialPartner === sim) other.interrupt();
        }
        sim.interrupt();
        sim.x = gx;
        sim.y = gy;
        pendingMoveSimId = null;
        setMode("live");
        hud.renderSim(sim, sims);
      }
    },
    onSimClick: (simId) => {
      if (mode !== "live") return;
      selectedSimId = simId;
      renderer.selectedSimId = simId;
      hud.renderSimTabs(sims, selectedSimId);
    },
  });

  renderer.selectedSimId = selectedSimId;

  renderer.app.ticker.add(() => {
    const dtSeconds = renderer.app.ticker.deltaMS / 1000;
    const simMinutes = clock.tick(dtSeconds);
    if (simMinutes > 0) {
      for (const sim of sims) sim.update(simMinutes, lot);
      for (const pet of pets) pet.update(simMinutes, lot);
      updateAI(sims, lot);
      updateJobs(
        sims,
        clock,
        (amount) => {
          funds += amount;
          hud.setFunds(funds);
        },
        (sim, newTitle) => hud.flashPromotion(sim.name, newTitle),
        (sim, jobTitle) => hud.flashFired(sim.name, jobTitle),
      );
    }
    hud.setClock(`${clock.dayName} · ${clock.formatTime()}`);
    const selected = sims.find((s) => s.id === selectedSimId) ?? null;
    hud.renderSim(selected, sims);
  });
}

main();
