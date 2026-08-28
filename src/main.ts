import "./style.css";
import { Lot } from "./game/Lot.ts";
import { Sim } from "./game/Sim.ts";
import { Personality, randomPersonality } from "./game/Personality.ts";
import { GameObject } from "./game/GameObject.ts";
import { OBJECT_CATALOG } from "./game/ObjectCatalog.ts";
import { updateAI } from "./game/AI.ts";
import { updateJobs } from "./game/Jobs.ts";
import { SimClock } from "./engine/Clock.ts";
import { IsoRenderer } from "./render/IsoRenderer.ts";
import { HUD, formatMoney, type Mode } from "./ui/HUD.ts";
import {
  loadFromStorage,
  saveToStorage,
  clearStorage,
  deserializeLot,
  deserializeSims,
} from "./game/SaveGame.ts";

const LOT_WIDTH = 14;
const LOT_HEIGHT = 14;
const STARTING_FUNDS = 3000;

const SIM_NAME_POOL = ["Bella", "Mortimer", "Cassandra", "Michael", "Dudley", "Kaylynn", "Bob", "Ivy"];
const SIM_COLOR_POOL = [0x4a7bd6, 0xd64a7b, 0x4ad67f, 0xd6a54a, 0x9a6ac2, 0x4ad6d0];

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

// A single interior wall spans the full width at row-boundary 7, splitting
// the lot into a top half (kitchen, living room) and bottom half (corridor,
// bedroom, bathroom), with three doorway gaps. Real edge walls have zero
// thickness, so every tile — including the ones the wall runs along — stays
// usable floor; nothing is "consumed" by the wall the way a tile-filling
// wall would.
function createStarterLot(): Lot {
  const lot = new Lot(LOT_WIDTH, LOT_HEIGHT);

  for (let x = 0; x < LOT_WIDTH; x++) lot.setHWall(x, 7, true);
  lot.setHWall(3, 7, false);
  lot.setHWall(7, 7, false);
  lot.setHWall(10, 7, false);

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
function createStarterSims(): Sim[] {
  const bella = new Personality({ neat: 5, outgoing: 8, active: 5, playful: 7, nice: 6 });
  const mortimer = new Personality({ neat: 8, outgoing: 3, active: 4, playful: 4, nice: 6 });
  return [
    new Sim(1, "Bella Goth", colorForId(1), 7, 6, bella),
    new Sim(2, "Mortimer Goth", colorForId(2), 7, 8, mortimer),
  ];
}

async function main(): Promise<void> {
  const appRoot = document.getElementById("app")!;
  const canvasHolder = document.createElement("div");
  canvasHolder.id = "game-canvas-holder";
  appRoot.appendChild(canvasHolder);

  const saveData = loadFromStorage();
  const lot = saveData ? deserializeLot(saveData) : createStarterLot();
  const sims: Sim[] = saveData ? deserializeSims(saveData) : createStarterSims();
  let nextSimId = saveData ? saveData.nextSimId : sims.length + 1;
  let funds = saveData ? (saveData.funds ?? STARTING_FUNDS) : STARTING_FUNDS;

  let selectedSimId: number | null = sims[0]?.id ?? null;
  let mode: Mode = "live";
  let activePaletteType: string | null = null;

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
    onSave: () => saveToStorage(lot, sims, nextSimId, funds),
    onResetSave: () => {
      clearStorage();
      window.location.reload();
    },
    onSetJob: (jobId) => {
      const sim = sims.find((s) => s.id === selectedSimId);
      if (!sim) return;
      sim.jobId = jobId;
      hud.renderSim(sim, sims);
    },
  });

  hud.setMode(mode);
  hud.setSpeed(clock.speed);
  hud.setFunds(funds);
  hud.renderSimTabs(sims, selectedSimId);

  await renderer.init(canvasHolder, lot, () => sims, {
    onTileClick: (gx, gy, fracX, fracY) => {
      if (mode === "build") {
        toggleNearestWall(lot, gx, gy, fracX, fracY);
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
        const sim = new Sim(id, nameForId(id), colorForId(id), gx, gy, randomPersonality());
        sims.push(sim);
        selectedSimId = sim.id;
        renderer.selectedSimId = sim.id;
        hud.renderSimTabs(sims, selectedSimId);
        setMode("live");
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
      updateAI(sims, lot);
      updateJobs(sims, clock, (amount) => {
        funds += amount;
        hud.setFunds(funds);
      });
    }
    hud.setClock(`${clock.dayName} · ${clock.formatTime()}`);
    const selected = sims.find((s) => s.id === selectedSimId) ?? null;
    hud.renderSim(selected, sims);
  });
}

main();
