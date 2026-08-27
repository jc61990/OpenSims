import { Lot } from "./Lot.ts";
import { Sim } from "./Sim.ts";
import { GameObject } from "./GameObject.ts";
import { OBJECT_CATALOG } from "./ObjectCatalog.ts";
import { MOTIVE_TYPES, type MotiveType } from "./types.ts";

const SAVE_KEY = "opensims:save:v1";

export interface SaveData {
  version: 1;
  lotWidth: number;
  lotHeight: number;
  walls: boolean[];
  floors: number[];
  objects: { type: string; x: number; y: number }[];
  sims: {
    id: number;
    name: string;
    color: number;
    x: number;
    y: number;
    motives: Partial<Record<MotiveType, number>>;
  }[];
  nextSimId: number;
}

export function serialize(lot: Lot, sims: Sim[], nextSimId: number): SaveData {
  const walls: boolean[] = [];
  const floors: number[] = [];
  for (let y = 0; y < lot.height; y++) {
    for (let x = 0; x < lot.width; x++) {
      walls.push(lot.hasWall(x, y));
      floors.push(lot.getFloor(x, y));
    }
  }
  return {
    version: 1,
    lotWidth: lot.width,
    lotHeight: lot.height,
    walls,
    floors,
    objects: lot.objects.map((o) => ({ type: o.type, x: o.gridX, y: o.gridY })),
    sims: sims.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      x: s.x,
      y: s.y,
      motives: s.motives.snapshot(),
    })),
    nextSimId,
  };
}

export function saveToStorage(lot: Lot, sims: Sim[], nextSimId: number): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(lot, sims, nextSimId)));
}

export function loadFromStorage(): SaveData | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 1) return null;
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
    for (let x = 0; x < data.lotWidth; x++) {
      const i = y * data.lotWidth + x;
      lot.setWall(x, y, data.walls[i]);
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
    const sim = new Sim(s.id, s.name, s.color, s.x, s.y);
    for (const m of MOTIVE_TYPES) {
      const value = s.motives[m];
      if (value !== undefined) sim.motives.set(m, value);
    }
    return sim;
  });
}
