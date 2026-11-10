import { Lot } from "./Lot.ts";
import { GameObject } from "./GameObject.ts";
import { OBJECT_CATALOG } from "./ObjectCatalog.ts";
import { Sim } from "./Sim.ts";
import { Personality } from "./Personality.ts";
import { Pet } from "./Pet.ts";

/**
 * Neighbor Sim/pet ids are drawn from a block well above anything the
 * player's own household ever reaches (it starts at 4 and only grows one at
 * a time via "+ Sim"), so the two id spaces can never collide even in a
 * very long play session. Each house gets its own 100-wide block.
 */
const NEIGHBOR_ID_BASE = 10_000;

export interface NeighborHouse {
  readonly id: string;
  readonly name: string;
  readonly lot: Lot;
  readonly sims: Sim[];
  readonly pets: Pet[];
}

function buildHouseLot(width: number, height: number, floorColor: number): Lot {
  const lot = new Lot(width, height);
  lot.setFloorRect(0, 0, width - 1, height - 1, floorColor);
  for (let x = 0; x < width; x++) {
    lot.setHWall(x, 0, true);
    lot.setHWall(x, height, true);
  }
  for (let y = 0; y < height; y++) {
    lot.setVWall(0, y, true);
    lot.setVWall(width, y, true);
  }
  // A single front door, centered on the south wall.
  const doorX = Math.floor(width / 2);
  lot.setHWall(doorX, height, false);
  lot.setHDoor(doorX, height, true);
  return lot;
}

/**
 * A handful of original neighbor households — distinct names and vibes
 * (this project's own invented personalities, not a reproduction of any
 * actual Sims 1 families), each a small, lightly-furnished one-room house.
 * Built once at startup (cheap: a few small lots and under a dozen Sims
 * total) and kept around in memory for the rest of the session; per the
 * "simple scenery" design, none of this is saved — reloading the page
 * regenerates fresh neighbors exactly like reloading regenerates a fresh
 * starter household if there's no active save slot.
 */
export function buildNeighborhood(): NeighborHouse[] {
  let nextId = NEIGHBOR_ID_BASE;

  function place(lot: Lot, type: string, x: number, y: number): void {
    lot.addObject(new GameObject(OBJECT_CATALOG[type], x, y));
  }

  // Hart household — a playful young couple, big on company and TV nights.
  const hartLot = buildHouseLot(10, 10, 0x8a6a4a);
  place(hartLot, "sofa", 2, 2);
  place(hartLot, "tv", 2, 4);
  place(hartLot, "fridge", 7, 2);
  place(hartLot, "counter", 7, 4);
  place(hartLot, "bed", 2, 7);
  place(hartLot, "bed", 5, 7);
  place(hartLot, "stereo", 8, 7);
  const jordanHart = new Sim(
    nextId++,
    "Jordan Hart",
    0x4a7bd6,
    3,
    3,
    new Personality({ neat: 4, outgoing: 8, active: 6, playful: 8, nice: 7 }),
  );
  const priyaHart = new Sim(
    nextId++,
    "Priya Hart",
    0xd64a7b,
    6,
    3,
    new Personality({ neat: 5, outgoing: 7, active: 5, playful: 7, nice: 8 }),
  );
  jordanHart.setFamilyRelationRaw(priyaHart.id, "spouse");
  priyaHart.setFamilyRelationRaw(jordanHart.id, "spouse");
  const hartPet = new Pet(nextId++, "Biscuit", "dog", 0xd6a54a, 8, 3);

  // Okafor household — one neat, independent Sim who keeps to herself.
  nextId = NEIGHBOR_ID_BASE + 100;
  const okaforLot = buildHouseLot(8, 8, 0x5a8a8a);
  place(okaforLot, "bookshelf", 2, 2);
  place(okaforLot, "sofa", 5, 2);
  place(okaforLot, "fridge", 2, 5);
  place(okaforLot, "bed", 5, 5);
  const chidiOkafor = new Sim(
    nextId++,
    "Chidi Okafor",
    0x4ad67f,
    4,
    4,
    new Personality({ neat: 9, outgoing: 3, active: 4, playful: 3, nice: 7 }),
  );

  // Castillo household — a tidy, active couple, always fixing up the place.
  nextId = NEIGHBOR_ID_BASE + 200;
  const castilloLot = buildHouseLot(10, 10, 0x6a5a7a);
  place(castilloLot, "counter", 2, 2);
  place(castilloLot, "fridge", 2, 4);
  place(castilloLot, "sofa", 7, 2);
  place(castilloLot, "painting", 7, 1);
  place(castilloLot, "bed", 2, 7);
  place(castilloLot, "bed", 5, 7);
  place(castilloLot, "shower", 8, 7);
  const marcusCastillo = new Sim(
    nextId++,
    "Marcus Castillo",
    0xd6a54a,
    3,
    3,
    new Personality({ neat: 8, outgoing: 6, active: 8, playful: 5, nice: 6 }),
  );
  const elenaCastillo = new Sim(
    nextId++,
    "Elena Castillo",
    0x9a6ac2,
    6,
    3,
    new Personality({ neat: 7, outgoing: 6, active: 7, playful: 6, nice: 7 }),
  );
  marcusCastillo.setFamilyRelationRaw(elenaCastillo.id, "spouse");
  elenaCastillo.setFamilyRelationRaw(marcusCastillo.id, "spouse");

  // Whitfield household — a loner who'd rather not have visitors, honestly.
  nextId = NEIGHBOR_ID_BASE + 300;
  const whitfieldLot = buildHouseLot(8, 8, 0x4a4a4a);
  place(whitfieldLot, "tv", 2, 2);
  place(whitfieldLot, "sofa", 2, 4);
  place(whitfieldLot, "fridge", 5, 2);
  place(whitfieldLot, "bed", 5, 5);
  const owenWhitfield = new Sim(
    nextId++,
    "Owen Whitfield",
    0x4ad6d0,
    4,
    4,
    new Personality({ neat: 6, outgoing: 2, active: 3, playful: 4, nice: 3 }),
  );

  return [
    { id: "hart", name: "Hart Household", lot: hartLot, sims: [jordanHart, priyaHart], pets: [hartPet] },
    { id: "okafor", name: "Okafor Household", lot: okaforLot, sims: [chidiOkafor], pets: [] },
    { id: "castillo", name: "Castillo Household", lot: castilloLot, sims: [marcusCastillo, elenaCastillo], pets: [] },
    { id: "whitfield", name: "Whitfield Household", lot: whitfieldLot, sims: [owenWhitfield], pets: [] },
  ];
}
