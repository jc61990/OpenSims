import type { Sim } from "./Sim.ts";
import type { Lot } from "./Lot.ts";
import type { GameObject, Interaction } from "./GameObject.ts";
import type { Pet } from "./Pet.ts";
import { findAdjacentWalkable } from "./AI.ts";

/**
 * Player-directed versions of AI.ts's autonomous behaviors, triggered from
 * the right-click context menu (IsoRenderer/HUD/main.ts) rather than a
 * motive crossing an urgency threshold. The key difference from the AI: a
 * command always interrupts whatever the Sim is currently doing first —
 * the AI only ever acts on an already-idle Sim, but a player clicking "Use"
 * on an object means "drop what you're doing and do this instead."
 */

/** Walks the Sim to `object` and uses `interaction` on arrival. False if the object isn't reachable at all. */
export function commandUseObject(sim: Sim, object: GameObject, interaction: Interaction, lot: Lot): boolean {
  if (!object.isFree()) return false;
  const spot = object.standSpot;
  if (!lot.isWalkableTile(spot.x, spot.y)) return false;
  sim.interrupt();
  return sim.walkTo(lot, spot.x, spot.y, () => {
    if (!object.isFree()) return; // someone beat us to it
    sim.startUsing(object, interaction);
  });
}

/** Walks the Sim next to `partner` and starts a chat on arrival, interrupting both parties. */
export function commandSocialize(sim: Sim, partner: Sim, lot: Lot): boolean {
  if (sim === partner || partner.state === "atWork") return false;
  const spot = findAdjacentWalkable(lot, partner.gridX, partner.gridY, sim.x, sim.y);
  if (!spot) return false;
  sim.interrupt();
  return sim.walkTo(lot, spot.x, spot.y, () => {
    if (partner.state === "atWork") return;
    partner.interrupt();
    sim.startSocializing(partner);
    partner.startSocializing(sim);
  });
}

/** Walks the Sim next to `pet` and starts petting it on arrival. False if the pet is already being petted. */
export function commandPet(sim: Sim, pet: Pet, lot: Lot): boolean {
  if (!pet.isFree()) return false;
  const spot = findAdjacentWalkable(lot, pet.gridX, pet.gridY, sim.x, sim.y);
  if (!spot) return false;
  sim.interrupt();
  return sim.walkTo(lot, spot.x, spot.y, () => {
    if (!pet.isFree()) return; // someone beat us to it
    sim.startPetting(pet);
    pet.occupiedBy = sim;
  });
}

/** A plain move command — interrupts whatever the Sim was doing and walks them to (gx,gy). */
export function commandWalkTo(sim: Sim, lot: Lot, gx: number, gy: number): boolean {
  if (!lot.isWalkableTile(gx, gy)) return false;
  sim.interrupt();
  return sim.walkTo(lot, gx, gy);
}
