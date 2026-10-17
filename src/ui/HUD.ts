import {
  MOTIVE_LABELS,
  MOTIVE_TYPES,
  SIM_COLOR_POOL,
  TRAIT_LABELS,
  TRAIT_TYPES,
  type MotiveType,
  type TraitType,
} from "../game/types.ts";
import { OBJECT_CATALOG } from "../game/ObjectCatalog.ts";
import { CAREER_TRACKS } from "../game/Job.ts";
import { relationshipLabel, RELATIONSHIP_LABEL_COLORS } from "../game/Relationships.ts";
import { listSaveSlots } from "../game/SaveGame.ts";
import { formatMinuteOfDay, type SimSpeed } from "../engine/Clock.ts";
import type { Sim } from "../game/Sim.ts";

export type Mode = "live" | "build" | "doors" | "buy" | "addsim" | "movesim";

export interface NewSimData {
  name: string;
  color: number;
  personality: Partial<Record<TraitType, number>>;
}

export interface HUDCallbacks {
  onSpeedChange: (speed: SimSpeed) => void;
  onModeChange: (mode: Mode) => void;
  onPaletteSelect: (objectType: string) => void;
  onSelectSim: (simId: number) => void;
  onRemoveSim: () => void;
  /** Arms movesim mode for the currently selected Sim; next tile click relocates them. */
  onMoveSim: () => void;
  onSave: () => void;
  onResetSave: () => void;
  /** Saves the current game state as a new (or overwritten) named slot and makes it active. */
  onSaveAs: (name: string) => void;
  /** Loads a slot and makes it active — reloads the page to apply it. */
  onLoadSlot: (name: string) => void;
  onDeleteSlot: (name: string) => void;
  onSetCareer: (careerId: string | null) => void;
  /** Fired once the Create Sim modal is submitted; placement mode arms right after. */
  onCreateSim: (data: NewSimData) => void;
  /** Fired once the Edit Sim modal is submitted, applying changes to an already-placed Sim. */
  onEditSim: (simId: number, data: NewSimData) => void;
}

function motiveColor(value: number): string {
  if (value < -20) return "#e05555";
  if (value < 20) return "#e0b055";
  return "#55c778";
}

export function formatMoney(amount: number): string {
  return `§${Math.round(amount).toLocaleString()}`;
}

export class HUD {
  private root: HTMLElement;
  private simTabsEl!: HTMLElement;
  private motiveRowsEl!: HTMLElement;
  private traitRowsEl!: HTMLElement;
  private relationshipsEl!: HTMLElement;
  private careerEl!: HTMLElement;
  private actionLabelEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private fundsEl!: HTMLElement;
  private buyStatusEl!: HTMLElement;
  private buyStatusTimer: ReturnType<typeof setTimeout> | null = null;
  private speedButtons = {} as Record<SimSpeed, HTMLButtonElement>;
  private modeButtons = {} as Record<Mode, HTMLButtonElement>;
  private static readonly ALL_SPEEDS: SimSpeed[] = [0, 1, 2, 3];
  private static readonly ALL_MODES: Mode[] = ["live", "buy", "build", "doors", "addsim"];
  private paletteEl!: HTMLElement;
  private callbacks: HUDCallbacks;
  private activePalette: string | null = null;
  private saveStatusEl!: HTMLElement;
  private saveStatusTimer: ReturnType<typeof setTimeout> | null = null;
  private modalOverlay!: HTMLElement;
  private modalTitleEl!: HTMLElement;
  private modalSubmitBtn!: HTMLButtonElement;
  private nameInput!: HTMLInputElement;
  private colorSwatches: HTMLElement[] = [];
  private selectedColor = SIM_COLOR_POOL[0];
  private traitSliders = {} as Record<TraitType, HTMLInputElement>;
  /** "create" arms placement on submit; "edit" applies changes to editingSimId in place. */
  private modalMode: "create" | "edit" = "create";
  private editingSimId: number | null = null;
  /** The Sim last passed to renderSim, so the Edit button knows who to edit. */
  private currentSim: Sim | null = null;
  private careerStatusEl!: HTMLElement;
  private careerTitleEl!: HTMLElement;
  private careerProgressFillEl!: HTMLElement;
  private promotionToastEl!: HTMLElement;
  private promotionToastTimer: ReturnType<typeof setTimeout> | null = null;
  private saveSlotsOverlay!: HTMLElement;
  private saveSlotsListEl!: HTMLElement;
  private newSlotNameInput!: HTMLInputElement;
  private activeSlotLabelEl!: HTMLElement;
  private activeSlotName: string | null = null;

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

    this.promotionToastEl = document.createElement("div");
    this.promotionToastEl.className = "promotion-toast";
    this.promotionToastEl.style.display = "none";
    this.root.appendChild(this.promotionToastEl);

    const hud = document.createElement("div");
    hud.className = "hud";

    const simPanel = document.createElement("div");
    simPanel.className = "panel sim-panel";
    const simHeader = document.createElement("h3");
    const simTitle = document.createElement("span");
    simTitle.textContent = "Sim";
    const editBtn = document.createElement("button");
    editBtn.className = "mode-btn";
    editBtn.textContent = "Edit";
    editBtn.onclick = () => {
      if (this.currentSim) this.openEditSimModal(this.currentSim);
    };
    const moveBtn = document.createElement("button");
    moveBtn.className = "mode-btn";
    moveBtn.textContent = "Move";
    moveBtn.onclick = () => this.callbacks.onMoveSim();
    const removeBtn = document.createElement("button");
    removeBtn.className = "mode-btn";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = () => this.callbacks.onRemoveSim();
    const simHeaderActions = document.createElement("div");
    simHeaderActions.className = "sim-header-actions";
    simHeaderActions.appendChild(editBtn);
    simHeaderActions.appendChild(moveBtn);
    simHeaderActions.appendChild(removeBtn);
    simHeader.appendChild(simTitle);
    simHeader.appendChild(simHeaderActions);
    simPanel.appendChild(simHeader);
    this.simTabsEl = document.createElement("div");
    this.simTabsEl.className = "sim-tabs";
    simPanel.appendChild(this.simTabsEl);
    this.motiveRowsEl = document.createElement("div");
    simPanel.appendChild(this.motiveRowsEl);
    for (const m of MOTIVE_TYPES) {
      const row = document.createElement("div");
      row.className = "motive-row";
      row.dataset.motive = m;
      row.innerHTML = `<span class="motive-label">${MOTIVE_LABELS[m]}</span><div class="motive-bar"><div class="motive-bar-fill"></div></div>`;
      this.motiveRowsEl.appendChild(row);
    }

    const traitsHeading = document.createElement("div");
    traitsHeading.className = "section-heading";
    traitsHeading.textContent = "Personality";
    simPanel.appendChild(traitsHeading);
    this.traitRowsEl = document.createElement("div");
    simPanel.appendChild(this.traitRowsEl);
    for (const t of TRAIT_TYPES) {
      const row = document.createElement("div");
      row.className = "motive-row";
      row.dataset.trait = t;
      row.innerHTML = `<span class="motive-label">${TRAIT_LABELS[t]}</span><div class="motive-bar"><div class="motive-bar-fill trait-fill"></div></div>`;
      this.traitRowsEl.appendChild(row);
    }

    this.relationshipsEl = document.createElement("div");
    this.relationshipsEl.className = "relationships";
    simPanel.appendChild(this.relationshipsEl);

    const careerHeading = document.createElement("div");
    careerHeading.className = "section-heading";
    careerHeading.textContent = "Career";
    simPanel.appendChild(careerHeading);

    this.careerStatusEl = document.createElement("div");
    this.careerStatusEl.className = "career-status";
    this.careerTitleEl = document.createElement("div");
    this.careerTitleEl.className = "career-status-title";
    this.careerStatusEl.appendChild(this.careerTitleEl);
    const progressBar = document.createElement("div");
    progressBar.className = "motive-bar";
    this.careerProgressFillEl = document.createElement("div");
    this.careerProgressFillEl.className = "motive-bar-fill promo-fill";
    progressBar.appendChild(this.careerProgressFillEl);
    this.careerStatusEl.appendChild(progressBar);
    simPanel.appendChild(this.careerStatusEl);

    this.careerEl = document.createElement("div");
    this.careerEl.className = "palette-panel career-panel";
    simPanel.appendChild(this.careerEl);
    this.buildCareerButtons();

    this.actionLabelEl = document.createElement("div");
    this.actionLabelEl.className = "action-label";
    simPanel.appendChild(this.actionLabelEl);

    const controlsPanel = document.createElement("div");
    controlsPanel.className = "panel controls-panel";
    this.clockEl = document.createElement("div");
    this.clockEl.className = "clock-readout";
    controlsPanel.appendChild(this.clockEl);
    this.fundsEl = document.createElement("div");
    this.fundsEl.className = "funds-readout";
    controlsPanel.appendChild(this.fundsEl);
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
      { mode: "doors", label: "Doors" },
      { mode: "addsim", label: "+ Sim" },
    ];
    for (const { mode, label } of modeDefs) {
      const btn = document.createElement("button");
      btn.className = "mode-btn";
      btn.textContent = label;
      btn.onclick = () => {
        if (mode === "addsim") this.openCreateSimModal();
        else this.callbacks.onModeChange(mode);
      };
      modeRow.appendChild(btn);
      this.modeButtons[mode] = btn;
    }
    controlsPanel.appendChild(modeRow);

    this.activeSlotLabelEl = document.createElement("div");
    this.activeSlotLabelEl.className = "hint active-slot-label";
    this.activeSlotLabelEl.textContent = "Unsaved household";
    controlsPanel.appendChild(this.activeSlotLabelEl);

    const saveRow = document.createElement("div");
    saveRow.className = "mode-controls";
    const saveBtn = document.createElement("button");
    saveBtn.className = "mode-btn";
    saveBtn.textContent = "Save";
    saveBtn.onclick = () => {
      this.callbacks.onSave();
      this.flashSaveStatus("Saved");
    };
    const savesBtn = document.createElement("button");
    savesBtn.className = "mode-btn";
    savesBtn.textContent = "Saves";
    savesBtn.onclick = () => this.openSaveSlotsModal();
    const resetBtn = document.createElement("button");
    resetBtn.className = "mode-btn";
    resetBtn.textContent = "Reset";
    resetBtn.onclick = () => {
      if (window.confirm("Start a new, unsaved household? (Your saved households won't be deleted.)")) {
        this.callbacks.onResetSave();
      }
    };
    saveRow.appendChild(saveBtn);
    saveRow.appendChild(savesBtn);
    saveRow.appendChild(resetBtn);
    controlsPanel.appendChild(saveRow);
    this.saveStatusEl = document.createElement("div");
    this.saveStatusEl.className = "hint";
    controlsPanel.appendChild(this.saveStatusEl);

    const palettePanel = document.createElement("div");
    palettePanel.className = "panel palette-panel";
    this.paletteEl = palettePanel;
    for (const key of Object.keys(OBJECT_CATALOG)) {
      const def = OBJECT_CATALOG[key];
      const item = document.createElement("div");
      item.className = "palette-item";
      item.innerHTML = `${def.label}<br><span class="palette-price">${formatMoney(def.price)}</span>`;
      item.onclick = () => {
        this.activePalette = key;
        this.callbacks.onPaletteSelect(key);
        this.refreshPalette();
      };
      palettePanel.appendChild(item);
    }
    this.buyStatusEl = document.createElement("div");
    this.buyStatusEl.className = "hint buy-status";
    palettePanel.appendChild(this.buyStatusEl);
    palettePanel.style.display = "none";

    hud.appendChild(simPanel);
    hud.appendChild(controlsPanel);
    hud.appendChild(palettePanel);
    this.root.appendChild(hud);

    this.buildCreateSimModal();
    this.buildSaveSlotsModal();
  }

  private buildCreateSimModal(): void {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.style.display = "none";
    this.modalOverlay = overlay;

    const modal = document.createElement("div");
    modal.className = "panel modal-panel";

    this.modalTitleEl = document.createElement("h3");
    this.modalTitleEl.textContent = "Create a Sim";
    modal.appendChild(this.modalTitleEl);

    const nameLabel = document.createElement("div");
    nameLabel.className = "section-heading";
    nameLabel.textContent = "Name";
    modal.appendChild(nameLabel);
    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.className = "modal-input";
    this.nameInput.placeholder = "Sim name";
    this.nameInput.maxLength = 24;
    modal.appendChild(this.nameInput);

    const colorLabel = document.createElement("div");
    colorLabel.className = "section-heading";
    colorLabel.textContent = "Color";
    modal.appendChild(colorLabel);
    const swatchRow = document.createElement("div");
    swatchRow.className = "swatch-row";
    for (const color of SIM_COLOR_POOL) {
      const swatch = document.createElement("div");
      swatch.className = "color-swatch";
      swatch.style.background = `#${color.toString(16).padStart(6, "0")}`;
      swatch.dataset.color = String(color);
      swatch.onclick = () => {
        this.selectedColor = color;
        this.refreshSwatches();
      };
      swatchRow.appendChild(swatch);
      this.colorSwatches.push(swatch);
    }
    modal.appendChild(swatchRow);

    const traitsLabel = document.createElement("div");
    traitsLabel.className = "section-heading";
    traitsLabel.textContent = "Personality";
    modal.appendChild(traitsLabel);
    for (const t of TRAIT_TYPES) {
      const row = document.createElement("div");
      row.className = "slider-row";
      const label = document.createElement("span");
      label.className = "motive-label";
      label.textContent = TRAIT_LABELS[t];
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "0";
      slider.max = "10";
      slider.value = "5";
      slider.className = "trait-slider";
      row.appendChild(label);
      row.appendChild(slider);
      modal.appendChild(row);
      this.traitSliders[t] = slider;
    }

    const buttonRow = document.createElement("div");
    buttonRow.className = "mode-controls modal-buttons";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "mode-btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = () => this.closeCreateSimModal();
    this.modalSubmitBtn = document.createElement("button");
    this.modalSubmitBtn.className = "mode-btn primary";
    this.modalSubmitBtn.textContent = "Create & Place";
    this.modalSubmitBtn.onclick = () => {
      const personality: Partial<Record<TraitType, number>> = {};
      for (const t of TRAIT_TYPES) personality[t] = Number(this.traitSliders[t].value);
      const name = this.nameInput.value.trim() || "New Sim";
      if (this.modalMode === "edit" && this.editingSimId !== null) {
        this.callbacks.onEditSim(this.editingSimId, { name, color: this.selectedColor, personality });
      } else {
        this.callbacks.onCreateSim({ name, color: this.selectedColor, personality });
      }
      this.closeCreateSimModal();
    };
    buttonRow.appendChild(cancelBtn);
    buttonRow.appendChild(this.modalSubmitBtn);
    modal.appendChild(buttonRow);

    overlay.appendChild(modal);
    this.root.appendChild(overlay);
  }

  private refreshSwatches(): void {
    for (const swatch of this.colorSwatches) {
      swatch.classList.toggle("selected", Number(swatch.dataset.color) === this.selectedColor);
    }
  }

  private openCreateSimModal(): void {
    this.modalMode = "create";
    this.editingSimId = null;
    this.modalTitleEl.textContent = "Create a Sim";
    this.modalSubmitBtn.textContent = "Create & Place";
    this.nameInput.value = "";
    this.selectedColor = SIM_COLOR_POOL[Math.floor(Math.random() * SIM_COLOR_POOL.length)];
    this.refreshSwatches();
    for (const t of TRAIT_TYPES) this.traitSliders[t].value = "5";
    this.modalOverlay.style.display = "flex";
    this.nameInput.focus();
  }

  private openEditSimModal(sim: Sim): void {
    this.modalMode = "edit";
    this.editingSimId = sim.id;
    this.modalTitleEl.textContent = "Edit Sim";
    this.modalSubmitBtn.textContent = "Save Changes";
    this.nameInput.value = sim.name;
    this.selectedColor = sim.color;
    this.refreshSwatches();
    const traits = sim.personality.snapshot();
    for (const t of TRAIT_TYPES) this.traitSliders[t].value = String(traits[t]);
    this.modalOverlay.style.display = "flex";
    this.nameInput.focus();
  }

  private closeCreateSimModal(): void {
    this.modalOverlay.style.display = "none";
  }

  private buildSaveSlotsModal(): void {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.style.display = "none";
    this.saveSlotsOverlay = overlay;

    const modal = document.createElement("div");
    modal.className = "panel modal-panel";

    const title = document.createElement("h3");
    title.textContent = "Saved Households";
    modal.appendChild(title);

    this.saveSlotsListEl = document.createElement("div");
    this.saveSlotsListEl.className = "save-slots-list";
    modal.appendChild(this.saveSlotsListEl);

    const newLabel = document.createElement("div");
    newLabel.className = "section-heading";
    newLabel.textContent = "Save current as new";
    modal.appendChild(newLabel);
    const newRow = document.createElement("div");
    newRow.className = "save-slot-new-row";
    this.newSlotNameInput = document.createElement("input");
    this.newSlotNameInput.type = "text";
    this.newSlotNameInput.className = "modal-input";
    this.newSlotNameInput.placeholder = "Household name";
    this.newSlotNameInput.maxLength = 32;
    const saveAsBtn = document.createElement("button");
    saveAsBtn.className = "mode-btn primary";
    saveAsBtn.textContent = "Save As";
    saveAsBtn.onclick = () => {
      const name = this.newSlotNameInput.value.trim();
      if (!name) return;
      this.callbacks.onSaveAs(name);
      this.newSlotNameInput.value = "";
      this.refreshSaveSlotsList();
    };
    newRow.appendChild(this.newSlotNameInput);
    newRow.appendChild(saveAsBtn);
    modal.appendChild(newRow);

    const buttonRow = document.createElement("div");
    buttonRow.className = "mode-controls modal-buttons";
    const closeBtn = document.createElement("button");
    closeBtn.className = "mode-btn";
    closeBtn.textContent = "Close";
    closeBtn.onclick = () => this.closeSaveSlotsModal();
    buttonRow.appendChild(closeBtn);
    modal.appendChild(buttonRow);

    overlay.appendChild(modal);
    this.root.appendChild(overlay);
  }

  private refreshSaveSlotsList(): void {
    this.saveSlotsListEl.innerHTML = "";
    const slots = listSaveSlots();
    if (slots.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "No saved households yet.";
      this.saveSlotsListEl.appendChild(empty);
      return;
    }
    for (const name of slots) {
      const row = document.createElement("div");
      row.className = "save-slot-row" + (name === this.activeSlotName ? " active" : "");
      const label = document.createElement("span");
      label.className = "save-slot-name";
      label.textContent = name;
      const loadBtn = document.createElement("button");
      loadBtn.className = "mode-btn";
      loadBtn.textContent = "Load";
      loadBtn.onclick = () => this.callbacks.onLoadSlot(name);
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "mode-btn";
      deleteBtn.textContent = "Delete";
      deleteBtn.onclick = () => {
        if (window.confirm(`Delete "${name}"? This can't be undone.`)) {
          this.callbacks.onDeleteSlot(name);
          this.refreshSaveSlotsList();
        }
      };
      row.appendChild(label);
      row.appendChild(loadBtn);
      row.appendChild(deleteBtn);
      this.saveSlotsListEl.appendChild(row);
    }
  }

  private openSaveSlotsModal(): void {
    this.refreshSaveSlotsList();
    this.saveSlotsOverlay.style.display = "flex";
  }

  private closeSaveSlotsModal(): void {
    this.saveSlotsOverlay.style.display = "none";
  }

  /** Reflects which slot the session is currently tied to — null for an unsaved household. */
  setActiveSlotName(name: string | null): void {
    this.activeSlotName = name;
    this.activeSlotLabelEl.textContent = name ? `Playing: ${name}` : "Unsaved household";
  }

  private buildCareerButtons(): void {
    const makeButton = (careerId: string | null, html: string) => {
      const item = document.createElement("div");
      item.className = "palette-item career-item";
      item.innerHTML = html;
      item.dataset.job = careerId ?? "none";
      item.onclick = () => this.callbacks.onSetCareer(careerId);
      this.careerEl.appendChild(item);
    };
    makeButton(null, "Unemployed");
    for (const track of Object.values(CAREER_TRACKS)) {
      const entry = track.levels[0];
      const schedule = `${formatMinuteOfDay(entry.leaveMinute)}–${formatMinuteOfDay(entry.returnMinute)}`;
      makeButton(
        track.id,
        `${track.name}<br><span class="palette-price">${entry.title} · ${formatMoney(entry.dailyPay)}/day · ${schedule}</span>`,
      );
    }
  }

  flashPromotion(simName: string, newTitle: string): void {
    this.flashToast(`🎉 ${simName} was promoted to ${newTitle}!`, "good");
  }

  flashFired(simName: string, jobTitle: string): void {
    this.flashToast(`😞 ${simName} was fired from ${jobTitle}!`, "bad");
  }

  private flashToast(text: string, variant: "good" | "bad"): void {
    this.promotionToastEl.textContent = text;
    this.promotionToastEl.classList.toggle("toast-bad", variant === "bad");
    this.promotionToastEl.style.display = "block";
    if (this.promotionToastTimer) clearTimeout(this.promotionToastTimer);
    this.promotionToastTimer = setTimeout(() => {
      this.promotionToastEl.style.display = "none";
    }, 3500);
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

  setFunds(amount: number): void {
    this.fundsEl.textContent = formatMoney(amount);
  }

  flashBuyStatus(text: string): void {
    this.buyStatusEl.textContent = text;
    if (this.buyStatusTimer) clearTimeout(this.buyStatusTimer);
    this.buyStatusTimer = setTimeout(() => {
      this.buyStatusEl.textContent = "";
    }, 2000);
  }

  private flashSaveStatus(text: string): void {
    this.saveStatusEl.textContent = text;
    if (this.saveStatusTimer) clearTimeout(this.saveStatusTimer);
    this.saveStatusTimer = setTimeout(() => {
      this.saveStatusEl.textContent = "";
    }, 2000);
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

  renderSim(sim: Sim | null, allSims: Sim[] = []): void {
    this.currentSim = sim;
    if (!sim) {
      this.actionLabelEl.textContent = "";
      this.relationshipsEl.innerHTML = "";
      for (const item of this.careerEl.querySelectorAll(".career-item")) item.classList.remove("active");
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

    const traits = sim.personality.snapshot();
    for (const t of TRAIT_TYPES) {
      const row = this.traitRowsEl.querySelector<HTMLElement>(`[data-trait="${t}"]`);
      if (!row) continue;
      const fill = row.querySelector<HTMLElement>(".motive-bar-fill")!;
      fill.style.width = `${(traits[t as TraitType] / 10) * 100}%`;
    }

    this.relationshipsEl.innerHTML = "";
    const others = allSims.filter((s) => s.id !== sim.id);
    if (others.length > 0) {
      const heading = document.createElement("div");
      heading.className = "section-heading";
      heading.textContent = "Relationships";
      this.relationshipsEl.appendChild(heading);
      for (const other of others) {
        const value = sim.getRelationship(other.id);
        const romance = sim.getRomance(other.id);
        const label = relationshipLabel(value, romance);
        const row = document.createElement("div");
        row.className = "motive-row";
        const pct = ((value + 100) / 200) * 100;
        row.innerHTML = `<span class="motive-label">${other.name}</span><div class="motive-bar"><div class="motive-bar-fill" style="width:${pct}%;background:${motiveColor(value)}"></div></div><span class="relationship-label" style="color:${RELATIONSHIP_LABEL_COLORS[label]}">${label}</span>`;
        this.relationshipsEl.appendChild(row);
      }
    }

    const careerItems = this.careerEl.querySelectorAll<HTMLElement>(".career-item");
    for (const item of careerItems) {
      item.classList.toggle("active", item.dataset.job === (sim.careerId ?? "none"));
    }

    const track = sim.careerId ? CAREER_TRACKS[sim.careerId] : null;
    const level = track?.levels[sim.careerLevel];
    if (track && level) {
      const atTop = sim.careerLevel >= track.levels.length - 1;
      this.careerTitleEl.textContent = atTop
        ? `${level.title} (top of ${track.name})`
        : `${level.title} — ${Math.round(sim.promotionProgress)}% to promotion`;
      this.careerProgressFillEl.style.width = atTop ? "100%" : `${sim.promotionProgress}%`;
      this.careerStatusEl.style.display = "block";
    } else {
      this.careerStatusEl.style.display = "none";
    }

    this.actionLabelEl.textContent = sim.currentAction;
  }
}
