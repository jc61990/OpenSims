import { Lot, type Diagonal } from "./Lot.ts";
import { Sim, MAX_MEMORIES } from "./Sim.ts";
import { Personality } from "./Personality.ts";
import { GameObject } from "./GameObject.ts";
import { OBJECT_CATALOG } from "./ObjectCatalog.ts";
import { MOTIVE_TYPES, TRAIT_TYPES, type MotiveType, type TraitType } from "./types.ts";
import type { FamilyRelation } from "./Relationships.ts";
import { Pet, type PetType } from "./Pet.ts";

// The original single fixed-key save, from before named slots existed.
// Nothing writes here anymore — it's only read once, by migrateLegacySave.
const SAVE_KEY = "opensims:save:v1";

// Bumped to 2 when walls moved from per-tile flags to edge arrays — an
// incompatible format change, so an old v1 save is simply discarded (falls
// back to the starter lot) rather than misread.
export interface SaveData {
  version: 2;
  /** Set by saveToSlot; absent on a slot migrated from the pre-metadata legacy save. */
  savedAt?: number;
  lotWidth: number;
  lotHeight: number;
  /** Vertical edges, row-major: index = y*(lotWidth+1)+x, x in 0..lotWidth. */
  vWalls: boolean[];
  /** Horizontal edges, row-major: index = y*lotWidth+x, y in 0..lotHeight. */
  hWalls: boolean[];
  /** Same indexing as vWalls/hWalls. Optional: older v2 saves predate doors. */
  vDoors?: boolean[];
  hDoors?: boolean[];
  /** Tile-indexed (y*lotWidth+x), like floors. Optional: older v2 saves predate diagonal walls. */
  diagonals?: Diagonal[];
  floors: number[];
  objects: { type: string; x: number; y: number }[];
  sims: {
    id: number;
    name: string;
    color: number;
    x: number;
    y: number;
    motives: Partial<Record<MotiveType, number>>;
    personality?: Partial<Record<TraitType, number>>;
    relationships?: [number, number][];
    romances?: [number, number][];
    familyRelations?: [number, FamilyRelation][];
    careerId?: string | null;
    careerLevel?: number;
    promotionProgress?: number;
    /** Optional: older saves predate the chat memory log. */
    memories?: string[];
  }[];
  nextSimId: number;
  /** Optional: older saves predate pets. */
  pets?: { id: number; name: string; type: PetType; color: number; x: number; y: number }[];
  nextPetId?: number;
  funds?: number;
}

export function serialize(lot: Lot, sims: Sim[], nextSimId: number, funds: number, pets: Pet[] = [], nextPetId = 1): SaveData {
  const vWalls: boolean[] = [];
  for (let y = 0; y < lot.height; y++) {
    for (let x = 0; x <= lot.width; x++) vWalls.push(lot.getVWall(x, y));
  }
  const hWalls: boolean[] = [];
  for (let y = 0; y <= lot.height; y++) {
    for (let x = 0; x < lot.width; x++) hWalls.push(lot.getHWall(x, y));
  }
  const vDoors: boolean[] = [];
  for (let y = 0; y < lot.height; y++) {
    for (let x = 0; x <= lot.width; x++) vDoors.push(lot.getVDoor(x, y));
  }
  const hDoors: boolean[] = [];
  for (let y = 0; y <= lot.height; y++) {
    for (let x = 0; x < lot.width; x++) hDoors.push(lot.getHDoor(x, y));
  }
  const floors: number[] = [];
  for (let y = 0; y < lot.height; y++) {
    for (let x = 0; x < lot.width; x++) floors.push(lot.getFloor(x, y));
  }
  const diagonals: Diagonal[] = [];
  for (let y = 0; y < lot.height; y++) {
    for (let x = 0; x < lot.width; x++) diagonals.push(lot.getDiagonal(x, y));
  }
  return {
    version: 2,
    lotWidth: lot.width,
    lotHeight: lot.height,
    vWalls,
    hWalls,
    vDoors,
    hDoors,
    diagonals,
    floors,
    objects: lot.objects.map((o) => ({ type: o.type, x: o.gridX, y: o.gridY })),
    sims: sims.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      x: s.x,
      y: s.y,
      motives: s.motives.snapshot(),
      personality: s.personality.snapshot(),
      relationships: s.relationshipEntries(),
      romances: s.romanceEntries(),
      familyRelations: s.familyRelationEntries(),
      careerId: s.careerId,
      careerLevel: s.careerLevel,
      promotionProgress: s.promotionProgress,
      memories: s.memories,
    })),
    nextSimId,
    pets: pets.map((p) => ({ id: p.id, name: p.name, type: p.type, color: p.color, x: p.x, y: p.y })),
    nextPetId,
    funds,
  };
}

// Multiple named households can be saved side by side. SLOTS_KEY holds the
// ordered list of slot names; each slot's data lives under its own key so
// loading one slot never has to touch another's. LAST_ACTIVE_KEY is which
// slot to resume on page load, so a refresh continues the same household.
const SLOTS_KEY = "opensims:save:slots";
const LAST_ACTIVE_KEY = "opensims:save:lastActive";

function slotStorageKey(name: string): string {
  return `opensims:save:slot:${encodeURIComponent(name)}`;
}

/**
 * Moves a pre-multi-slot save (the single fixed-key save this project used
 * to have) into a slot named "My Household", once. A no-op after the first
 * call ever since — the slot registry's mere presence (even empty) marks
 * migration as already done.
 */
function migrateLegacySave(): void {
  if (localStorage.getItem(SLOTS_KEY) !== null) return;
  const legacy = localStorage.getItem(SAVE_KEY);
  if (legacy) {
    localStorage.setItem(slotStorageKey("My Household"), legacy);
    localStorage.setItem(SLOTS_KEY, JSON.stringify(["My Household"]));
    localStorage.setItem(LAST_ACTIVE_KEY, "My Household");
    localStorage.removeItem(SAVE_KEY);
  } else {
    localStorage.setItem(SLOTS_KEY, JSON.stringify([]));
  }
}

export function listSaveSlots(): string[] {
  migrateLegacySave();
  try {
    return JSON.parse(localStorage.getItem(SLOTS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function saveToSlot(
  name: string,
  lot: Lot,
  sims: Sim[],
  nextSimId: number,
  funds: number,
  pets: Pet[] = [],
  nextPetId = 1,
): void {
  const data = serialize(lot, sims, nextSimId, funds, pets, nextPetId);
  data.savedAt = Date.now();
  localStorage.setItem(slotStorageKey(name), JSON.stringify(data));
  const slots = listSaveSlots();
  if (!slots.includes(name)) {
    localStorage.setItem(SLOTS_KEY, JSON.stringify([...slots, name]));
  }
}

export function loadFromSlot(name: string): SaveData | null {
  const raw = localStorage.getItem(slotStorageKey(name));
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 2) return null;
    return data;
  } catch {
    return null;
  }
}

export function deleteSaveSlot(name: string): void {
  localStorage.removeItem(slotStorageKey(name));
  localStorage.setItem(SLOTS_KEY, JSON.stringify(listSaveSlots().filter((n) => n !== name)));
}

/**
 * Renames a slot in place: moves its stored data to the new key, keeps its
 * position in the slot list (rather than appending at the end the way
 * delete-and-resave-as-new would), and carries the last-active pointer
 * forward if this was the active slot. Returns false (no-op) if oldName
 * doesn't exist or newName collides with a different existing slot.
 */
export function renameSaveSlot(oldName: string, newName: string): boolean {
  if (oldName === newName) return true;
  const slots = listSaveSlots();
  const idx = slots.indexOf(oldName);
  if (idx === -1) return false;
  if (slots.includes(newName)) return false;

  const raw = localStorage.getItem(slotStorageKey(oldName));
  if (raw === null) return false;
  localStorage.setItem(slotStorageKey(newName), raw);
  localStorage.removeItem(slotStorageKey(oldName));

  const renamed = [...slots];
  renamed[idx] = newName;
  localStorage.setItem(SLOTS_KEY, JSON.stringify(renamed));

  if (getLastActiveSlot() === oldName) setLastActiveSlot(newName);
  return true;
}

export interface SlotMeta {
  name: string;
  /** null for a slot migrated from the pre-metadata legacy save, or one that failed to load. */
  savedAt: number | null;
  simCount: number;
  funds: number;
}

/** listSaveSlots() plus each slot's at-a-glance stats, for the Saves modal. */
export function listSaveSlotsWithMeta(): SlotMeta[] {
  return listSaveSlots().map((name) => {
    const data = loadFromSlot(name);
    return {
      name,
      savedAt: data?.savedAt ?? null,
      simCount: data?.sims.length ?? 0,
      funds: data?.funds ?? 0,
    };
  });
}

/** Which slot to resume on page load, so a refresh continues the same household. */
export function getLastActiveSlot(): string | null {
  migrateLegacySave();
  return localStorage.getItem(LAST_ACTIVE_KEY);
}

export function setLastActiveSlot(name: string | null): void {
  if (name === null) localStorage.removeItem(LAST_ACTIVE_KEY);
  else localStorage.setItem(LAST_ACTIVE_KEY, name);
}

export function deserializeLot(data: SaveData): Lot {
  const lot = new Lot(data.lotWidth, data.lotHeight);
  for (let y = 0; y < data.lotHeight; y++) {
    for (let x = 0; x <= data.lotWidth; x++) {
      lot.setVWall(x, y, data.vWalls[y * (data.lotWidth + 1) + x]);
    }
  }
  for (let y = 0; y <= data.lotHeight; y++) {
    for (let x = 0; x < data.lotWidth; x++) {
      lot.setHWall(x, y, data.hWalls[y * data.lotWidth + x]);
    }
  }
  // Doors are optional: an older v2 save predating them just has none.
  for (let y = 0; y < data.lotHeight; y++) {
    for (let x = 0; x <= data.lotWidth; x++) {
      lot.setVDoor(x, y, data.vDoors?.[y * (data.lotWidth + 1) + x] ?? false);
    }
  }
  for (let y = 0; y <= data.lotHeight; y++) {
    for (let x = 0; x < data.lotWidth; x++) {
      lot.setHDoor(x, y, data.hDoors?.[y * data.lotWidth + x] ?? false);
    }
  }
  for (let y = 0; y < data.lotHeight; y++) {
    for (let x = 0; x < data.lotWidth; x++) {
      const i = y * data.lotWidth + x;
      if (data.floors?.[i] !== undefined) lot.setFloor(x, y, data.floors[i]);
      lot.setDiagonal(x, y, data.diagonals?.[i] ?? "none");
    }
  }
  for (const o of data.objects) {
    const def = OBJECT_CATALOG[o.type];
    if (!def) continue;
    lot.addObject(new GameObject(def, o.x, o.y));
  }
  return lot;
}

export function deserializeSims(data: SaveData): Sim[] {
  return data.sims.map((s) => {
    const personality = new Personality();
    for (const t of TRAIT_TYPES) {
      const value = s.personality?.[t];
      if (value !== undefined) personality.set(t, value);
    }
    const sim = new Sim(s.id, s.name, s.color, s.x, s.y, personality);
    for (const m of MOTIVE_TYPES) {
      const value = s.motives[m];
      if (value !== undefined) sim.motives.set(m, value);
    }
    for (const [otherId, value] of s.relationships ?? []) {
      sim.adjustRelationship(otherId, value);
    }
    for (const [otherId, value] of s.romances ?? []) {
      sim.adjustRomance(otherId, value);
    }
    for (const [otherId, relation] of s.familyRelations ?? []) {
      sim.setFamilyRelationRaw(otherId, relation);
    }
    sim.careerId = s.careerId ?? null;
    sim.careerLevel = s.careerLevel ?? 0;
    sim.promotionProgress = s.promotionProgress ?? 0;
    sim.memories = (s.memories ?? []).slice(-MAX_MEMORIES);
    return sim;
  });
}

export function deserializePets(data: SaveData): Pet[] {
  return (data.pets ?? []).map((p) => new Pet(p.id, p.name, p.type, p.color, p.x, p.y));
}
