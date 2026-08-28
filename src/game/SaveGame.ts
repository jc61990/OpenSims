import { Lot } from "./Lot.ts";
import { Sim } from "./Sim.ts";
import { Personality } from "./Personality.ts";
import { GameObject } from "./GameObject.ts";
import { OBJECT_CATALOG } from "./ObjectCatalog.ts";
import { MOTIVE_TYPES, TRAIT_TYPES, type MotiveType, type TraitType } from "./types.ts";

const SAVE_KEY = "opensims:save:v1";

// Bumped to 2 when walls moved from per-tile flags to edge arrays — an
// incompatible format change, so an old v1 save is simply discarded (falls
// back to the starter lot) rather than misread.
export interface SaveData {
  version: 2;
  lotWidth: number;
  lotHeight: number;
  /** Vertical edges, row-major: index = y*(lotWidth+1)+x, x in 0..lotWidth. */
  vWalls: boolean[];
  /** Horizontal edges, row-major: index = y*lotWidth+x, y in 0..lotHeight. */
  hWalls: boolean[];
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
    careerId?: string | null;
    careerLevel?: number;
    promotionProgress?: number;
  }[];
  nextSimId: number;
  funds?: number;
}

export function serialize(lot: Lot, sims: Sim[], nextSimId: number, funds: number): SaveData {
  const vWalls: boolean[] = [];
  for (let y = 0; y < lot.height; y++) {
    for (let x = 0; x <= lot.width; x++) vWalls.push(lot.getVWall(x, y));
  }
  const hWalls: boolean[] = [];
  for (let y = 0; y <= lot.height; y++) {
    for (let x = 0; x < lot.width; x++) hWalls.push(lot.getHWall(x, y));
  }
  const floors: number[] = [];
  for (let y = 0; y < lot.height; y++) {
    for (let x = 0; x < lot.width; x++) floors.push(lot.getFloor(x, y));
  }
  return {
    version: 2,
    lotWidth: lot.width,
    lotHeight: lot.height,
    vWalls,
    hWalls,
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
      careerId: s.careerId,
      careerLevel: s.careerLevel,
      promotionProgress: s.promotionProgress,
    })),
    nextSimId,
    funds,
  };
}

export function saveToStorage(lot: Lot, sims: Sim[], nextSimId: number, funds: number): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(lot, sims, nextSimId, funds)));
}

export function loadFromStorage(): SaveData | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 2) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  localStorage.removeItem(SAVE_KEY);
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
  for (let y = 0; y < data.lotHeight; y++) {
    for (let x = 0; x < data.lotWidth; x++) {
      const i = y * data.lotWidth + x;
      if (data.floors?.[i] !== undefined) lot.setFloor(x, y, data.floors[i]);
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
    sim.careerId = s.careerId ?? null;
    sim.careerLevel = s.careerLevel ?? 0;
    sim.promotionProgress = s.promotionProgress ?? 0;
    return sim;
  });
}
