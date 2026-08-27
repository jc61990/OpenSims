import type { GameObjectDef } from "./GameObject.ts";

export const OBJECT_CATALOG: Record<string, GameObjectDef> = {
  fridge: {
    type: "fridge",
    label: "Fridge",
    color: 0xc7d6e0,
    standOffset: { dx: 0, dy: 1 },
    interactions: [
      { id: "eat", label: "Grab a snack", motive: "hunger", gainPerMinute: 8, durationMinutes: 12 },
    ],
  },
  bed: {
    type: "bed",
    label: "Bed",
    color: 0x6f8fd6,
    standOffset: { dx: 0, dy: 1 },
    interactions: [
      { id: "sleep", label: "Sleep", motive: "energy", gainPerMinute: 2, durationMinutes: 240 },
    ],
  },
  shower: {
    type: "shower",
    label: "Shower",
    color: 0x8fd6d0,
    standOffset: { dx: 0, dy: 1 },
    interactions: [
      { id: "wash", label: "Shower", motive: "hygiene", gainPerMinute: 10, durationMinutes: 10 },
    ],
  },
  toilet: {
    type: "toilet",
    label: "Toilet",
    color: 0xe0e0e0,
    standOffset: { dx: 0, dy: 1 },
    interactions: [
      { id: "use", label: "Use toilet", motive: "bladder", gainPerMinute: 15, durationMinutes: 7 },
    ],
  },
  tv: {
    type: "tv",
    label: "TV",
    color: 0x333333,
    standOffset: { dx: 0, dy: 1 },
    interactions: [
      { id: "watch", label: "Watch TV", motive: "fun", gainPerMinute: 4, durationMinutes: 60 },
    ],
  },
  stereo: {
    type: "stereo",
    label: "Stereo",
    color: 0xd6a54a,
    standOffset: { dx: 0, dy: 1 },
    interactions: [
      { id: "listen", label: "Listen to music", motive: "fun", gainPerMinute: 5, durationMinutes: 45 },
    ],
  },
  bookshelf: {
    type: "bookshelf",
    label: "Bookshelf",
    color: 0x8a5a3a,
    standOffset: { dx: 0, dy: 1 },
    interactions: [
      { id: "read", label: "Read", motive: "fun", gainPerMinute: 3, durationMinutes: 45 },
    ],
  },
};

export type ObjectTypeId = keyof typeof OBJECT_CATALOG;
