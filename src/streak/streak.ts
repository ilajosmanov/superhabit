import { addDays, type Day } from '@/lib/day';
import { countedWorkouts } from '@/workout/plan/results';

/** How a day looks on the grid. `open` is today with nothing done yet; `before` is before your first set. */
export type DayKind = 'alive' | 'rest' | 'frozen' | 'missed' | 'open' | 'before' | 'future';

type FreezeEvent = { id: string; day: Day; kind: 'earned' | 'used' };

/** Alive days in a row that earn a freeze, and the most you can hold. */
export const EARN_EVERY = 7;
export const HOLD = 2;
/**
 * Freezes are paid (Monetization Plan), and there is no paid tier yet: off, nobody earns one, so no day is
 * frozen and no event is written. The rules stay; turn this on per person when the tier exists.
 */
export const FREEZES: boolean = false;

export type Streak = {
  /** Alive or frozen days in the current streak; scheduled recovery bridges without adding. */
  current: number;
  best: number;
  /** Any alive day ever, even one after today (the phone's clock went back): not your first time. */
  trained: boolean;
  /** Freezes held now. */
  held: number;
  /** Alive days still to do for the next freeze; null while both are held. */
  toNext: number | null;
  /** Today: done, keeping a streak, broken yesterday, or nothing to lose. */
  status: 'done' | 'rest' | 'atRisk' | 'slipped' | 'start';
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
  sets: ReadonlyMap<string, readonly { reps: number; heldMs: number }[]>,
): Day[] {
  return countedWorkouts(workouts, sets).map((workout) => workout.day);
}

/**
 * Your streak from the days you trained (alive days) and today. Computed in full every time: freeze
 * events are only its record, so a day another phone later makes alive is simply alive, its freeze kept.
 * Recovery is neutral, regardless of freezes: it bridges without earning or spending one.
 * Without `freezes` none is earned: every missed training day breaks the streak.
 */
export function streak(
  alive: Iterable<Day>,
  today: Day,
  freezes = FREEZES,
  rest: Iterable<Day> = [],
): Streak {
  const done = new Set(alive);
  const recovery = new Set(rest);
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
  let slipped = false;

  // A day after today (the phone's clock went back) waits until it comes.
  const first = [...done].filter((day) => day <= today).sort()[0];
  for (let day = first; first && day <= today; day = addDays(day, 1)) {
    if (done.has(day)) {
      kinds.set(day, 'alive');
      current += 1;
      count += 1;
      if (count === EARN_EVERY) {
        count = 0;
        if (freezes && held < HOLD) {
          held += 1;
          record('earned', day);
        }
      }
    } else if (recovery.has(day)) {
      kinds.set(day, 'rest');
      // Preserve the streak and freeze progress without granting activity or spending a freeze.
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
      // Rest bridges a streak of 0 too, so only the count says whether yesterday broke one.
      if (day === addDays(today, -1)) slipped = current > 0;
      current = 0;
      count = 0;
    }
    best = Math.max(best, current);
  }

  const kind = (day: Day): DayKind =>
    day > today
      ? 'future'
      : (kinds.get(day) ?? (recovery.has(day) ? 'rest' : day === today ? 'open' : 'before'));
  const status =
    kind(today) === 'alive'
      ? 'done'
      : kind(today) === 'rest'
        ? 'rest'
        : current > 0
          ? 'atRisk'
          : slipped
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
