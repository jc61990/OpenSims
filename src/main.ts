import "./style.css";
import { Lot } from "./game/Lot.ts";
import { Sim } from "./game/Sim.ts";
import { GameObject } from "./game/GameObject.ts";
import { OBJECT_CATALOG } from "./game/ObjectCatalog.ts";
import { updateAI } from "./game/AI.ts";
import { SimClock } from "./engine/Clock.ts";
import { IsoRenderer } from "./render/IsoRenderer.ts";
import { HUD, type Mode } from "./ui/HUD.ts";
import {
  loadFromStorage,
  saveToStorage,
  clearStorage,
  deserializeLot,
  deserializeSims,
} from "./game/SaveGame.ts";

const LOT_WIDTH = 14;
const LOT_HEIGHT = 14;

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

// A central north-south corridor (column 7, aligned with the perimeter
// doorway) links four rooms: kitchen (top-left), living room (top-right),
// bedroom (bottom-left), and bathroom (bottom-right). Each room also opens
// directly onto the corridor since no wall separates them from it, and the
// two horizontal partition walls each carry one extra doorway of their own.
function createStarterLot(): Lot {
  const lot = new Lot(LOT_WIDTH, LOT_HEIGHT);

  for (let x = 1; x <= 6; x++) lot.setWall(x, 7, true);
  lot.setWall(3, 7, false);
  for (let x = 8; x <= 13; x++) lot.setWall(x, 7, true);
  lot.setWall(10, 7, false);

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
// used for townsfolk added later via "+ Sim".
function createStarterSims(): Sim[] {
  return [
    new Sim(1, "Bella Goth", colorForId(1), 7, 6),
    new Sim(2, "Mortimer Goth", colorForId(2), 7, 8),
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
    onSave: () => saveToStorage(lot, sims, nextSimId),
    onResetSave: () => {
      clearStorage();
      window.location.reload();
    },
  });

  hud.setMode(mode);
  hud.setSpeed(clock.speed);
  hud.renderSimTabs(sims, selectedSimId);

  await renderer.init(canvasHolder, lot, () => sims, {
    onTileClick: (gx, gy) => {
      if (mode === "build") {
        if (!lot.inBounds(gx, gy)) return;
        if (lot.objectAt(gx, gy)) return;
        lot.setWall(gx, gy, !lot.hasWall(gx, gy));
      } else if (mode === "buy") {
        if (!activePaletteType) return;
        const def = OBJECT_CATALOG[activePaletteType];
        if (!def) return;
        lot.addObject(new GameObject(def, gx, gy));
      } else if (mode === "addsim") {
        if (!lot.isWalkable(gx, gy)) return;
        const id = nextSimId++;
        const sim = new Sim(id, nameForId(id), colorForId(id), gx, gy);
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
    }
    hud.setClock(`Day ${clock.day + 1} · ${clock.formatTime()}`);
    const selected = sims.find((s) => s.id === selectedSimId) ?? null;
    hud.renderSim(selected);
  });
}

main();
