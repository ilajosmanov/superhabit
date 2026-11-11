import { addDays, type Day } from '@/lib/day';
import { countedWorkouts } from '@/workout/plan/results';

/** How a day looks on the grid. `open` is today with nothing done yet; `before` is before your first set. */
export type DayKind = 'alive' | 'frozen' | 'missed' | 'open' | 'before' | 'future';

type FreezeEvent = { id: string; day: Day; kind: 'earned' | 'used' };

/** Alive days in a row that earn a freeze, and the most you can hold. */
export const EARN_EVERY = 7;
export const HOLD = 2;

export type Streak = {
  /** Alive or frozen days in a row, up to today (today counts once it is alive). */
  current: number;
  best: number;
  /** Any alive day ever, even one after today (the phone's clock went back): not your first time. */
  trained: boolean;
  /** Freezes held now. */
  held: number;
  /** Alive days still to do for the next freeze; null while both are held. */
  toNext: number | null;
  /** Today: done, keeping a streak, broken yesterday, or nothing to lose. */
  status: 'done' | 'atRisk' | 'slipped' | 'start';
  kind: (day: Day) => DayKind;
  /** What the rules decided for days already over; the store writes them as freeze events. */
  events: FreezeEvent[];
};

/**
 * The days you trained (alive days): days of done workouts with a counted rep or hold. Open and discarded
 * workouts don't count, nor does a Done with nothing counted. The grid and the freezes written both use it.
 */
export function aliveDays(
  workouts: readonly { id: string; day: Day; status: string }[],
  sets: readonly { workoutId: string; reps: number; heldMs: number }[],
): Day[] {
  return countedWorkouts(workouts, sets).map((workout) => workout.day);
}

/**
 * Your streak from the days you trained (alive days) and today. Computed in full every time: freeze
 * events are only its record, so a day another phone later makes alive is simply alive, its freeze kept.
 */
export function streak(alive: Iterable<Day>, today: Day): Streak {
  const done = new Set(alive);
  const kinds = new Map<Day, DayKind>();
  const events: FreezeEvent[] = [];
  const record = (kind: FreezeEvent['kind'], day: Day) => {
    if (day < today) events.push({ id: `${kind}:${day}`, day, kind });
  };
  let current = 0;
  let best = 0;
  let held = 0;
  // Alive days since the last break, frozen day or earned freeze.
  let count = 0;

  // A day after today (the phone's clock went back) waits until it comes.
  const first = [...done].filter((day) => day <= today).sort()[0];
  for (let day = first; first && day <= today; day = addDays(day, 1)) {
    if (done.has(day)) {
      kinds.set(day, 'alive');
      current += 1;
      count += 1;
      if (count === EARN_EVERY) {
        count = 0;
        if (held < HOLD) {
          held += 1;
          record('earned', day);
        }
      }
    } else if (day === today) {
      kinds.set(day, 'open');
    } else if (held > 0) {
      kinds.set(day, 'frozen');
      held -= 1;
      current += 1;
      count = 0;
      record('used', day);
    } else {
      kinds.set(day, 'missed');
      current = 0;
      count = 0;
    }
    best = Math.max(best, current);
  }

  const kind = (day: Day): DayKind =>
    day > today ? 'future' : (kinds.get(day) ?? (day === today ? 'open' : 'before'));
  const kept = (day: Day) => ['alive', 'frozen'].includes(kind(day));
  const status =
    kind(today) === 'alive'
      ? 'done'
      : current > 0
        ? 'atRisk'
        : kind(addDays(today, -1)) === 'missed' && kept(addDays(today, -2))
          ? 'slipped'
          : 'start';
  return {
    current,
    best,
    trained: done.size > 0,
    held,
    toNext: held === HOLD ? null : EARN_EVERY - count,
    status,
    kind,
    events,
  };
}
