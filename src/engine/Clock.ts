// Simulation clock: converts real elapsed time into sim-minutes, at a
// configurable speed multiplier (0 = paused, like classic Sims 1 speed keys).
export type SimSpeed = 0 | 1 | 2 | 3;

const REAL_SECONDS_PER_SIM_MINUTE = 1.2; // at speed 1
const SPEED_MULTIPLIERS: Record<SimSpeed, number> = {
  0: 0,
  1: 1,
  2: 2.5,
  3: 5,
};

const MINUTES_PER_DAY = 24 * 60;
const START_MINUTE = 9 * 60; // simulation starts at 9:00 AM
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export class SimClock {
  speed: SimSpeed = 1;
  private totalMinutes = START_MINUTE;

  /** Advance the clock by `dtSeconds` of real time. Returns sim-minutes elapsed. */
  tick(dtSeconds: number): number {
    if (this.speed === 0) return 0;
    const simMinutes = (dtSeconds / REAL_SECONDS_PER_SIM_MINUTE) * SPEED_MULTIPLIERS[this.speed];
    this.totalMinutes += simMinutes;
    return simMinutes;
  }

  get minuteOfDay(): number {
    return this.totalMinutes % MINUTES_PER_DAY;
  }

  get day(): number {
    return Math.floor(this.totalMinutes / MINUTES_PER_DAY);
  }

  /** 0 = Monday .. 6 = Sunday. Day 0 of the simulation starts on a Monday. */
  get dayOfWeek(): number {
    return this.day % 7;
  }

  get dayName(): string {
    return DAY_NAMES[this.dayOfWeek];
  }

  formatTime(): string {
    return formatMinuteOfDay(this.minuteOfDay);
  }
}

export function formatMinuteOfDay(m: number): string {
  let hour = Math.floor(m / 60);
  const minute = Math.floor(m % 60);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute.toString().padStart(2, "0")} ${ampm}`;
}
