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
  sofa: {
    type: "sofa",
    label: "Sofa",
    color: 0xb0563f,
    standOffset: { dx: 0, dy: 1 },
    interactions: [
      { id: "relax", label: "Relax", motive: "fun", gainPerMinute: 6, durationMinutes: 30 },
    ],
  },
  sink: {
    type: "sink",
    label: "Sink",
    color: 0xd8dde0,
    standOffset: { dx: 0, dy: 1 },
    interactions: [
      { id: "washup", label: "Wash up", motive: "hygiene", gainPerMinute: 6, durationMinutes: 5 },
    ],
  },
  dresser: {
    type: "dresser",
    label: "Dresser",
    color: 0x6b4a35,
    standOffset: { dx: 0, dy: 1 },
    interactions: [
      { id: "change", label: "Change clothes", motive: "hygiene", gainPerMinute: 4, durationMinutes: 8 },
    ],
  },
  counter: {
    type: "counter",
    label: "Counter",
    color: 0xcbb994,
    standOffset: { dx: 0, dy: 1 },
    interactions: [],
  },
  plant: {
    type: "plant",
    label: "Plant",
    color: 0x4a8a4a,
    standOffset: { dx: 0, dy: 1 },
    interactions: [],
  },
  painting: {
    type: "painting",
    label: "Painting",
    color: 0x9a6ac2,
    standOffset: { dx: 0, dy: 1 },
    interactions: [],
  },
};

export type ObjectTypeId = keyof typeof OBJECT_CATALOG;
