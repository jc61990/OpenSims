import { MOTIVE_LABELS, MOTIVE_TYPES, type MotiveType } from "../game/types.ts";
import { OBJECT_CATALOG } from "../game/ObjectCatalog.ts";
import type { Sim } from "../game/Sim.ts";
import type { SimSpeed } from "../engine/Clock.ts";

export type Mode = "live" | "build" | "buy";

export interface HUDCallbacks {
  onSpeedChange: (speed: SimSpeed) => void;
  onModeChange: (mode: Mode) => void;
  onPaletteSelect: (objectType: string) => void;
  onSelectSim: (simId: number) => void;
}

function motiveColor(value: number): string {
  if (value < -20) return "#e05555";
  if (value < 20) return "#e0b055";
  return "#55c778";
}

export class HUD {
  private root: HTMLElement;
  private simTabsEl!: HTMLElement;
  private motiveRowsEl!: HTMLElement;
  private actionLabelEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private speedButtons = {} as Record<SimSpeed, HTMLButtonElement>;
  private modeButtons = {} as Record<Mode, HTMLButtonElement>;
  private static readonly ALL_SPEEDS: SimSpeed[] = [0, 1, 2, 3];
  private static readonly ALL_MODES: Mode[] = ["live", "buy", "build"];
  private paletteEl!: HTMLElement;
  private callbacks: HUDCallbacks;
  private activePalette: string | null = null;

  constructor(root: HTMLElement, callbacks: HUDCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.buildDom();
  }

  private buildDom(): void {
    const topBar = document.createElement("div");
    topBar.className = "top-bar";
    topBar.innerHTML = `
      <div class="panel">
        <div class="title">OpenSims</div>
        <div class="hint">Drag to pan &middot; scroll to zoom &middot; click a Sim to select</div>
      </div>
    `;
    this.root.appendChild(topBar);

    const hud = document.createElement("div");
    hud.className = "hud";

    const simPanel = document.createElement("div");
    simPanel.className = "panel sim-panel";
    simPanel.innerHTML = `<h3>Sim</h3>`;
    this.simTabsEl = document.createElement("div");
    this.simTabsEl.className = "sim-tabs";
    simPanel.appendChild(this.simTabsEl);
    this.motiveRowsEl = document.createElement("div");
    simPanel.appendChild(this.motiveRowsEl);
    this.actionLabelEl = document.createElement("div");
    this.actionLabelEl.className = "action-label";
    simPanel.appendChild(this.actionLabelEl);
    for (const m of MOTIVE_TYPES) {
      const row = document.createElement("div");
      row.className = "motive-row";
      row.dataset.motive = m;
      row.innerHTML = `<span class="motive-label">${MOTIVE_LABELS[m]}</span><div class="motive-bar"><div class="motive-bar-fill"></div></div>`;
      this.motiveRowsEl.appendChild(row);
    }

    const controlsPanel = document.createElement("div");
    controlsPanel.className = "panel controls-panel";
    this.clockEl = document.createElement("div");
    this.clockEl.className = "clock-readout";
    controlsPanel.appendChild(this.clockEl);
    const speedRow = document.createElement("div");
    speedRow.className = "speed-controls";
    const speedDefs: { speed: SimSpeed; label: string }[] = [
      { speed: 0, label: "II" },
      { speed: 1, label: "1x" },
      { speed: 2, label: "2x" },
      { speed: 3, label: "3x" },
    ];
    for (const { speed, label } of speedDefs) {
      const btn = document.createElement("button");
      btn.className = "speed-btn";
      btn.textContent = label;
      btn.onclick = () => this.callbacks.onSpeedChange(speed);
      speedRow.appendChild(btn);
      this.speedButtons[speed] = btn;
    }
    controlsPanel.appendChild(speedRow);
    const modeRow = document.createElement("div");
    modeRow.className = "mode-controls";
    const modeDefs: { mode: Mode; label: string }[] = [
      { mode: "live", label: "Live" },
      { mode: "buy", label: "Buy" },
      { mode: "build", label: "Walls" },
    ];
    for (const { mode, label } of modeDefs) {
      const btn = document.createElement("button");
      btn.className = "mode-btn";
      btn.textContent = label;
      btn.onclick = () => this.callbacks.onModeChange(mode);
      modeRow.appendChild(btn);
      this.modeButtons[mode] = btn;
    }
    controlsPanel.appendChild(modeRow);

    const palettePanel = document.createElement("div");
    palettePanel.className = "panel palette-panel";
    this.paletteEl = palettePanel;
    for (const key of Object.keys(OBJECT_CATALOG)) {
      const def = OBJECT_CATALOG[key];
      const item = document.createElement("div");
      item.className = "palette-item";
      item.textContent = def.label;
      item.onclick = () => {
        this.activePalette = key;
        this.callbacks.onPaletteSelect(key);
        this.refreshPalette();
      };
      palettePanel.appendChild(item);
    }
    palettePanel.style.display = "none";

    hud.appendChild(simPanel);
    hud.appendChild(controlsPanel);
    hud.appendChild(palettePanel);
    this.root.appendChild(hud);
  }

  private refreshPalette(): void {
    const items = this.paletteEl.querySelectorAll<HTMLElement>(".palette-item");
    let i = 0;
    for (const key of Object.keys(OBJECT_CATALOG)) {
      items[i].classList.toggle("active", key === this.activePalette);
      i++;
    }
  }

  setMode(mode: Mode): void {
    for (const key of HUD.ALL_MODES) {
      this.modeButtons[key].classList.toggle("active", key === mode);
    }
    this.paletteEl.style.display = mode === "buy" ? "flex" : "none";
  }

  setSpeed(speed: SimSpeed): void {
    for (const key of HUD.ALL_SPEEDS) {
      this.speedButtons[key].classList.toggle("active", key === speed);
    }
  }

  setClock(text: string): void {
    this.clockEl.textContent = text;
  }

  renderSimTabs(sims: Sim[], selectedId: number | null): void {
    this.simTabsEl.innerHTML = "";
    for (const sim of sims) {
      const tab = document.createElement("div");
      tab.className = "sim-tab" + (sim.id === selectedId ? " active" : "");
      tab.textContent = sim.name;
      tab.onclick = () => this.callbacks.onSelectSim(sim.id);
      this.simTabsEl.appendChild(tab);
    }
  }

  renderSim(sim: Sim | null): void {
    if (!sim) {
      this.actionLabelEl.textContent = "";
      return;
    }
    const snapshot = sim.motives.snapshot();
    for (const m of MOTIVE_TYPES) {
      const row = this.motiveRowsEl.querySelector<HTMLElement>(`[data-motive="${m}"]`);
      if (!row) continue;
      const fill = row.querySelector<HTMLElement>(".motive-bar-fill")!;
      const value = snapshot[m as MotiveType];
      const pct = ((value + 100) / 200) * 100;
      fill.style.width = `${pct}%`;
      fill.style.background = motiveColor(value);
    }
    this.actionLabelEl.textContent = sim.currentAction;
  }
}
