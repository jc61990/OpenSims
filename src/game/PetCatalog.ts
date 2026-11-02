import type { PetType } from "./Pet.ts";

export interface PetDef {
  type: PetType;
  label: string;
  price: number;
  color: number;
  /** A fresh pet's name is picked randomly from this pool. */
  namePool: string[];
}

export const PET_CATALOG: Record<PetType, PetDef> = {
  dog: {
    type: "dog",
    label: "Dog",
    price: 150,
    color: 0xb9895a,
    namePool: ["Rex", "Buddy", "Max", "Daisy", "Duke", "Bella Jr."],
  },
  cat: {
    type: "cat",
    label: "Cat",
    price: 120,
    color: 0x6e6a66,
    namePool: ["Whiskers", "Mittens", "Shadow", "Luna", "Tiger", "Olive"],
  },
};

export function randomPetName(type: PetType, rng: () => number = Math.random): string {
  const pool = PET_CATALOG[type].namePool;
  return pool[Math.floor(rng() * pool.length)];
}
