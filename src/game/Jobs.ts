import { JOB_CATALOG, WORK_DAYS } from "./Job.ts";
import type { Sim } from "./Sim.ts";
import type { SimClock } from "../engine/Clock.ts";

/**
 * Sends Sims to and from work on schedule, interrupting whatever they're
 * doing when it's time to leave. A Sim at work is simply hidden from the lot
 * for the shift (no commute animation, no actual workplace) — a deliberate
 * simplification, same spirit as the rest of this MVP.
 */
export function updateJobs(sims: Sim[], clock: SimClock, addFunds: (amount: number) => void): void {
  const minute = clock.minuteOfDay;
  const isWorkday = WORK_DAYS.includes(clock.dayOfWeek);

  for (const sim of sims) {
    if (!sim.jobId) continue;
    const job = JOB_CATALOG[sim.jobId];
    if (!job) continue;

    const shouldBeAtWork = isWorkday && minute >= job.leaveMinute && minute < job.returnMinute;

    if (shouldBeAtWork && sim.state !== "atWork") {
      sim.interrupt();
      sim.state = "atWork";
      sim.currentAction = `Working (${job.title})`;
    } else if (!shouldBeAtWork && sim.state === "atWork") {
      sim.state = "idle";
      sim.currentAction = "Idle";
      addFunds(job.dailyPay);
    }
  }
}
