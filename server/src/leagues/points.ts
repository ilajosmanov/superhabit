import { z } from 'zod';

/**
 * How hard each exercise is, as effort = MET × seconds of work. MET from the 2024 Adult Compendium of
 * Physical Activities (code in the comment); `perRep` is the median time between counted reps in our
 * device clips (11 Nov 2026). Holds have no `perRep`: their seconds held are the work. An exercise missing
 * here (a newer app's) scores nothing until it is added.
 */
const EFFORT: Record<string, { met: number; perRep?: number }> = {
  squat: { met: 3.8, perRep: 2.57 }, // 02022 calisthenics, moderate
  'side-squat': { met: 3.8, perRep: 2.57 }, // 02022; no clips yet, timed as the squat
  pushup: { met: 3.8, perRep: 3.4 }, // 02022
  situp: { met: 3.8, perRep: 2.6 }, // 02022
  lunge: { met: 3.8, perRep: 3.97 }, // 02022
  'glute-bridge': { met: 2.8, perRep: 3.2 }, // 02024 calisthenics, light
  'leg-raise': { met: 2.8, perRep: 5.37 }, // 02024
  'jumping-jack': { met: 7.5, perRep: 1.03 }, // 02020 calisthenics, vigorous
  burpee: { met: 7.5, perRep: 6.9 }, // 02020
  plank: { met: 2.8 }, // 02024
  'side-plank': { met: 2.8 }, // 02024
  'wall-sit': { met: 2.8 }, // no entry; as the plank
};
/** One squat is one point. */
const SQUAT = 3.8 * 2.57;

/** Each day of a streak after its first adds 5%, up to 50%. */
const STREAK_BONUS = 0.05;
/** The longest streak that still adds: 11 days. */
export const STREAK_CAP = 11;

const goal = z.object({
  type: z.enum(['reps', 'seconds', 'max']),
  n: z.number().nonnegative().optional(),
});

export type ScoredSet = {
  day: string;
  exercise: string;
  goal: unknown;
  reps: number;
  heldMs: number;
};

/** A set's points: its work up to its goal (a Max goal has no cap), weighted by the exercise. */
export function setPoints({ exercise, goal: raw, reps, heldMs }: Omit<ScoredSet, 'day'>) {
  // Own keys only: `constructor` is no exercise.
  if (!Object.hasOwn(EFFORT, exercise)) return 0;
  const effort = EFFORT[exercise];
  const parsed = goal.safeParse(raw);
  const cap = (type: 'reps' | 'seconds') =>
    parsed.success && parsed.data.type === type ? (parsed.data.n ?? Infinity) : Infinity;
  const seconds = effort.perRep
    ? Math.min(reps, cap('reps')) * effort.perRep
    : Math.min(heldMs / 1000, cap('seconds'));
  return (effort.met * seconds) / SQUAT;
}

/**
 * A week's points: each set's points times the streak bonus of its day. `kept` holds the days that keep a
 * streak (trained, or saved by a freeze), from `STREAK_CAP` days before the week's first.
 */
export function weekPoints(scored: readonly ScoredSet[], kept: ReadonlySet<string>) {
  const total = scored.reduce((sum, set) => sum + bonused(set, kept), 0);
  return Math.round(total);
}

/**
 * A set's points with its streak bonus. A row an older server kept that can't be scored (a day that isn't
 * one) counts 0, so it never breaks its board or the week's close for everyone else.
 */
function bonused(set: ScoredSet, kept: ReadonlySet<string>) {
  try {
    return setPoints(set) * (1 + STREAK_BONUS * (streakOn(set.day, kept) - 1));
  } catch {
    return 0;
  }
}

/** Days in a row up to `day` that keep the streak, `day` counted though not in `kept`; at most `STREAK_CAP`. */
function streakOn(day: string, kept: ReadonlySet<string>) {
  let count = 1;
  while (count < STREAK_CAP && kept.has(addDays(day, -count))) count++;
  return count;
}

export function addDays(day: string, n: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}
