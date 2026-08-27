export interface JobDef {
  id: string;
  title: string;
  dailyPay: number;
  /** Minute of day (0-1439) the Sim leaves for work. */
  leaveMinute: number;
  /** Minute of day (0-1439) the Sim returns home. Must be > leaveMinute. */
  returnMinute: number;
}

// A simple single-tier career list, loosely inspired by The Sims 1's career
// tracks (original job names and pay figures, not a reproduction of theirs).
export const JOB_CATALOG: Record<string, JobDef> = {
  paperRoute: {
    id: "paperRoute",
    title: "Paper Route",
    dailyPay: 40,
    leaveMinute: 6 * 60,
    returnMinute: 9 * 60,
  },
  cashier: {
    id: "cashier",
    title: "Cashier",
    dailyPay: 70,
    leaveMinute: 9 * 60,
    returnMinute: 17 * 60,
  },
  officeWorker: {
    id: "officeWorker",
    title: "Office Worker",
    dailyPay: 120,
    leaveMinute: 8 * 60,
    returnMinute: 17 * 60,
  },
  scientist: {
    id: "scientist",
    title: "Scientist",
    dailyPay: 180,
    leaveMinute: 8 * 60 + 30,
    returnMinute: 18 * 60,
  },
};

// Jobs only run Monday-Friday (dayOfWeek 0-4); weekends are always off.
export const WORK_DAYS = [0, 1, 2, 3, 4];
