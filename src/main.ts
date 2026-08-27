import "./style.css";
import { Lot } from "./game/Lot.ts";
import { Sim } from "./game/Sim.ts";
import { GameObject } from "./game/GameObject.ts";
import { OBJECT_CATALOG } from "./game/ObjectCatalog.ts";
import { updateAI } from "./game/AI.ts";
import { SimClock } from "./engine/Clock.ts";
import { IsoRenderer } from "./render/IsoRenderer.ts";
import { HUD, type Mode } from "./ui/HUD.ts";

const LOT_WIDTH = 14;
const LOT_HEIGHT = 14;
const SIM_COLORS = [0x4a7bd6, 0xd64a7b];
const SIM_NAMES = ["Bella", "Mortimer"];

function createStarterLot(): Lot {
  const lot = new Lot(LOT_WIDTH, LOT_HEIGHT);
  const place = (type: string, x: number, y: number) => {
    lot.addObject(new GameObject(OBJECT_CATALOG[type], x, y));
  };
  place("fridge", 3, 3);
  place("bed", 10, 3);
  place("bed", 10, 5);
  place("shower", 3, 10);
  place("toilet", 5, 10);
  place("tv", 7, 3);
  place("stereo", 9, 10);
  place("bookshelf", 3, 6);
  return lot;
}

async function main(): Promise<void> {
  const appRoot = document.getElementById("app")!;
  const canvasHolder = document.createElement("div");
  canvasHolder.id = "game-canvas-holder";
  appRoot.appendChild(canvasHolder);

  const lot = createStarterLot();
  const sims: Sim[] = SIM_NAMES.map(
    (name, i) => new Sim(i + 1, name, SIM_COLORS[i], 6 + i, 6),
  );

  let selectedSimId: number | null = sims[0]?.id ?? null;
  let mode: Mode = "live";
  let activePaletteType: string | null = null;

  const clock = new SimClock();
  const renderer = new IsoRenderer();

  const hud = new HUD(appRoot, {
    onSpeedChange: (speed) => {
      clock.speed = speed;
      hud.setSpeed(speed);
    },
    onModeChange: (m) => {
      mode = m;
      hud.setMode(m);
    },
    onPaletteSelect: (type) => {
      activePaletteType = type;
    },
    onSelectSim: (id) => {
      selectedSimId = id;
      renderer.selectedSimId = id;
      hud.renderSimTabs(sims, selectedSimId);
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
