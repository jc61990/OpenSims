import { CAREER_TRACKS, WORK_DAYS } from "./Job.ts";
import type { Sim } from "./Sim.ts";
import type { SimClock } from "../engine/Clock.ts";
import type { MotiveType } from "./types.ts";

// A Sim's "readiness" the moment they leave for work, snapshotted here
// (rather than stored on Sim) since it's pure bookkeeping between the leave
// and return events within the same workday — not persistent progression
// the way careerId/careerLevel/promotionProgress are.
const departurePerformance = new Map<number, number>();

const PERFORMANCE_MOTIVES: MotiveType[] = ["hunger", "energy", "hygiene", "fun"];

/** 0-100: how ready a Sim looks for work right now, from motives -100..100. */
function computePerformance(sim: Sim): number {
  const avg = PERFORMANCE_MOTIVES.reduce((sum, m) => sum + sim.motives.get(m), 0) / PERFORMANCE_MOTIVES.length;
  return Math.max(0, Math.min(100, (avg + 100) / 2));
}

/**
 * Sends Sims to and from work on schedule, interrupting whatever they're
 * doing when it's time to leave. A Sim at work is simply hidden from the lot
 * for the shift (no commute animation, no actual workplace) — a deliberate
 * simplification, same spirit as the rest of this MVP.
 *
 * On return, also runs the promotion mechanic: performance is snapshotted
 * from motives at departure (matching The Sims 1's own idea that showing up
 * well-rested, fed, and groomed is what gets you promoted) and accumulated
 * into promotionProgress; a level-up resets it and calls onPromotion.
 */
export function updateJobs(
  sims: Sim[],
  clock: SimClock,
  addFunds: (amount: number) => void,
  onPromotion?: (sim: Sim, newTitle: string) => void,
): void {
  const minute = clock.minuteOfDay;
  const isWorkday = WORK_DAYS.includes(clock.dayOfWeek);

  for (const sim of sims) {
    if (!sim.careerId) continue;
    const track = CAREER_TRACKS[sim.careerId];
    const level = track?.levels[sim.careerLevel];
    if (!track || !level) continue;

    const shouldBeAtWork = isWorkday && minute >= level.leaveMinute && minute < level.returnMinute;

    if (shouldBeAtWork && sim.state !== "atWork") {
      departurePerformance.set(sim.id, computePerformance(sim));
      sim.interrupt();
      sim.state = "atWork";
      sim.currentAction = `Working (${level.title})`;
    } else if (!shouldBeAtWork && sim.state === "atWork") {
      sim.state = "idle";
      sim.currentAction = "Idle";
      addFunds(level.dailyPay);

      const performance = departurePerformance.get(sim.id) ?? 50;
      departurePerformance.delete(sim.id);
      const hasNextLevel = sim.careerLevel < track.levels.length - 1;
      if (hasNextLevel && level.daysToPromote > 0) {
        const gain = (performance / 100) * (100 / level.daysToPromote);
        sim.promotionProgress = Math.min(100, sim.promotionProgress + gain);
        if (sim.promotionProgress >= 100) {
          sim.careerLevel++;
          sim.promotionProgress = 0;
          onPromotion?.(sim, track.levels[sim.careerLevel].title);
        }
      }
    }
  }
}
