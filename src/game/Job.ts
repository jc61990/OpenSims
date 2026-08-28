export interface JobLevel {
  title: string;
  dailyPay: number;
  /** Minute of day (0-1439) the Sim leaves for work. */
  leaveMinute: number;
  /** Minute of day (0-1439) the Sim returns home. Must be > leaveMinute. */
  returnMinute: number;
  /** Roughly how many good workdays (high motives at departure) it takes to reach the next level. */
  daysToPromote: number;
}

export interface CareerTrack {
  id: string;
  name: string;
  levels: JobLevel[];
}

// A simple career-track list, loosely inspired by The Sims 1's own career
// tracks (original job/track names and pay figures, not a reproduction of
// theirs). Paper Route is a single-level odd job with nowhere to advance;
// the rest are proper tracks a Sim climbs by showing up well-rested, fed,
// and groomed — see Jobs.ts for how performance is scored.
export const CAREER_TRACKS: Record<string, CareerTrack> = {
  paperRoute: {
    id: "paperRoute",
    name: "Paper Route",
    levels: [
      { title: "Paper Route", dailyPay: 40, leaveMinute: 6 * 60, returnMinute: 9 * 60, daysToPromote: 0 },
    ],
  },
  retail: {
    id: "retail",
    name: "Retail",
    levels: [
      { title: "Cashier", dailyPay: 70, leaveMinute: 9 * 60, returnMinute: 17 * 60, daysToPromote: 5 },
      { title: "Sales Associate", dailyPay: 100, leaveMinute: 9 * 60, returnMinute: 17 * 60, daysToPromote: 6 },
      { title: "Assistant Manager", dailyPay: 140, leaveMinute: 9 * 60, returnMinute: 17 * 60, daysToPromote: 7 },
      { title: "Store Manager", dailyPay: 190, leaveMinute: 9 * 60, returnMinute: 17 * 60, daysToPromote: 0 },
    ],
  },
  business: {
    id: "business",
    name: "Business",
    levels: [
      { title: "Office Worker", dailyPay: 120, leaveMinute: 8 * 60, returnMinute: 17 * 60, daysToPromote: 5 },
      { title: "Junior Executive", dailyPay: 160, leaveMinute: 8 * 60, returnMinute: 17 * 60, daysToPromote: 6 },
      { title: "Director", dailyPay: 220, leaveMinute: 8 * 60, returnMinute: 17 * 60, daysToPromote: 7 },
      { title: "Vice President", dailyPay: 300, leaveMinute: 8 * 60, returnMinute: 17 * 60, daysToPromote: 0 },
    ],
  },
  science: {
    id: "science",
    name: "Science",
    levels: [
      { title: "Lab Assistant", dailyPay: 180, leaveMinute: 8 * 60 + 30, returnMinute: 18 * 60, daysToPromote: 5 },
      { title: "Research Scientist", dailyPay: 240, leaveMinute: 8 * 60 + 30, returnMinute: 18 * 60, daysToPromote: 6 },
      { title: "Senior Scientist", dailyPay: 320, leaveMinute: 8 * 60 + 30, returnMinute: 18 * 60, daysToPromote: 7 },
      { title: "Lead Scientist", dailyPay: 420, leaveMinute: 8 * 60 + 30, returnMinute: 18 * 60, daysToPromote: 0 },
    ],
  },
};

export function getJobLevel(careerId: string | null, level: number): JobLevel | null {
  if (!careerId) return null;
  return CAREER_TRACKS[careerId]?.levels[level] ?? null;
}

// Jobs only run Monday-Friday (dayOfWeek 0-4); weekends are always off.
export const WORK_DAYS = [0, 1, 2, 3, 4];
