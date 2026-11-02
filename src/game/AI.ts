import type { Sim } from "./Sim.ts";
import type { Lot } from "./Lot.ts";
import type { GameObject } from "./GameObject.ts";
import type { Pet } from "./Pet.ts";
import { MOTIVE_TYPES, type MotiveType } from "./types.ts";

const URGENCY_THRESHOLD = -10;

/**
 * The motive threshold below which a Sim will autonomously act on it. Social
 * is shifted by the Outgoing trait, so outgoing Sims seek company well before
 * it's a "problem" while shy ones tolerate a lot more isolation.
 */
function urgencyThreshold(sim: Sim, motive: MotiveType): number {
  if (motive === "social") {
    return URGENCY_THRESHOLD + (sim.personality.get("outgoing") - 5) * 3;
  }
  return URGENCY_THRESHOLD;
}

function mostUrgentForSim(sim: Sim): MotiveType | null {
  let worst: MotiveType | null = null;
  let worstMargin = 0;
  for (const motive of MOTIVE_TYPES) {
    const margin = urgencyThreshold(sim, motive) - sim.motives.get(motive);
    if (margin > worstMargin) {
      worstMargin = margin;
      worst = motive;
    }
  }
  return worst;
}

/** Runs one autonomy pass: idle sims with an urgent motive go decide what to do. */
export function updateAI(sims: Sim[], lot: Lot, pets: Pet[] = []): void {
  for (const sim of sims) {
    if (sim.state !== "idle") continue;
    const urgent = mostUrgentForSim(sim);
    if (!urgent) continue;

    if (urgent === "social") {
      tryStartSocial(sim, sims, lot);
    } else if (urgent === "fun" && tryPetNearby(sim, pets, lot)) {
      // handled — walking to pet a free, idle pet
    } else {
      tryUseObject(sim, urgent, lot);
    }
  }
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function tryUseObject(sim: Sim, motive: MotiveType, lot: Lot): void {
  let best: GameObject | null = null;
  let bestDist = Infinity;

  for (const obj of lot.objects) {
    if (!obj.isFree()) continue;
    if (!obj.interactions.some((i) => i.motive === motive)) continue;
    const spot = obj.standSpot;
    if (!lot.isWalkableTile(spot.x, spot.y)) continue;
    const d = distance(sim.x, sim.y, spot.x, spot.y);
    if (d < bestDist) {
      bestDist = d;
      best = obj;
    }
  }

  if (!best) return;
  const obj = best;
  const spot = obj.standSpot;
  sim.walkTo(lot, spot.x, spot.y, () => {
    if (!obj.isFree()) return; // someone beat us to it; try again next tick
    const interaction = obj.interactions.find((i) => i.motive === motive);
    if (interaction) sim.startUsing(obj, interaction);
  });
}

function findAdjacentWalkable(lot: Lot, cx: number, cy: number, fromX: number, fromY: number) {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (!lot.isWalkableTile(x, y)) continue;
      const d = distance(fromX, fromY, x, y);
      if (d < bestDist) {
        bestDist = d;
        best = { x, y };
      }
    }
  }
  return best;
}

/** Walks to and starts petting the nearest free, idle pet. Returns true once a walk is underway. */
function tryPetNearby(sim: Sim, pets: Pet[], lot: Lot): boolean {
  let best: Pet | null = null;
  let bestDist = Infinity;
  for (const pet of pets) {
    if (!pet.isFree() || pet.state !== "idle") continue;
    const d = distance(sim.x, sim.y, pet.x, pet.y);
    if (d < bestDist) {
      bestDist = d;
      best = pet;
    }
  }
  if (!best) return false;

  const target = best;
  const spot = findAdjacentWalkable(lot, target.gridX, target.gridY, sim.x, sim.y);
  if (!spot) return false;

  return sim.walkTo(lot, spot.x, spot.y, () => {
    if (!target.isFree()) return; // someone beat us to it; try again next tick
    sim.startPetting(target);
    target.occupiedBy = sim;
  });
}

function tryStartSocial(sim: Sim, sims: Sim[], lot: Lot): void {
  let partner: Sim | null = null;
  let bestDist = Infinity;
  for (const other of sims) {
    if (other === sim || other.state !== "idle") continue;
    const d = distance(sim.x, sim.y, other.x, other.y);
    if (d < bestDist) {
      bestDist = d;
      partner = other;
    }
  }
  if (!partner) return;

  const target = partner;
  const spot = findAdjacentWalkable(lot, target.gridX, target.gridY, sim.x, sim.y);
  if (!spot) return;

  sim.walkTo(lot, spot.x, spot.y, () => {
    if (target.state !== "idle") return;
    sim.startSocializing(target);
    target.startSocializing(sim);
  });
}
