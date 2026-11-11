import { addDays, type Day } from '@/lib/day';
import type { LoggedSet } from '@/workout/plan/logged-set';
import { expand, type Session } from '@/workout/plan/plan';
import { setShare, shareDone, workoutResults } from '@/workout/plan/results';

export type Workout = {
  id: string;
  runId: string | null;
  versionId: string | null;
  day: Day;
  status: 'open' | 'done';
  startedAt: number;
};
export type Run = {
  id: string;
  startedOn: Day;
  endedOn: Day | null;
  endReason: 'left' | null;
  pinnedVersionId: string | null;
};
export type Version = {
  id: string;
  days: number;
  dailyTotal: boolean;
  restartOnMiss: boolean;
  session: Session;
};
export type ProgressInput = {
  run: Run;
  /** Resolved with versionOf; historical versions are also needed for recorded workouts. */
  version: Version;
  versions: readonly Version[];
  workouts: readonly Workout[];
  sets: readonly LoggedSet[];
};
export type DayResult = {
  done: boolean;
  share: number;
  shown: Workout | null;
  /** A daily total's sum over the day's tries (reps, or seconds held); absent for other challenges. */
  total?: number;
  /** The sets the day shows: the shown try's, or every set a daily total summed. */
  sets: readonly LoggedSet[];
};
type RunDay = { day: Day; number: number; from: Day; result: DayResult };
type RunState = { state: 'active' | 'finished' | 'left'; day: number; from: Day };

export const versionOf = (
  run: Pick<Run, 'pinnedVersionId'>,
  challenge: { currentVersionId: string },
) => run.pinnedVersionId ?? challenge.currentVersionId;

function workoutVersion(input: ProgressInput, workout: Workout) {
  const version =
    workout.versionId === input.version.id
      ? input.version
      : input.versions.find(({ id }) => id === workout.versionId);
  if (!version) throw new Error(`Missing version for workout ${workout.id}`);
  return version;
}

function workoutShare(input: ProgressInput, workout: Workout) {
  const steps = expand(workoutVersion(input, workout).session);
  return shareDone(steps, workoutResults(steps, workout.id, input.sets));
}

/**
 * The input with one open workout counted as if it were Done: what the day will be once it is saved, by
 * the same rules (a daily total adds it, a later partial try still shows, a completed day stays done).
 */
// shortcut: only sets already written count; one whose write failed is missing from the preview until
// the log writes it again. Overlay the session's own results if writes fail in practice.
export const counting = (input: ProgressInput, workoutId: string): ProgressInput => ({
  ...input,
  workouts: input.workouts.map((w) => (w.id === workoutId ? { ...w, status: 'done' } : w)),
});

/** Only saved (Done) workouts count. A completed try survives a later partial redo. */
export function dayResult(input: ProgressInput, day: Day): DayResult {
  const tries = input.workouts
    .filter((w) => w.runId === input.run.id && w.day === day && w.status === 'done')
    .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
  const latest = tries.at(-1);
  if (!latest) return { done: false, share: 0, shown: null, sets: [] };

  // An edit takes effect at the next workout, never by reinterpreting a saved try with a new plan.
  const version = workoutVersion(input, latest);
  if (version.dailyTotal) {
    let amount = 0;
    let done = false;
    let finalShare = 0;
    const counted: LoggedSet[] = [];
    for (const workout of tries) {
      const steps = expand(workoutVersion(input, workout).session);
      const target = steps[0];
      for (const set of input.sets) {
        const step = steps[set.planStep];
        if (
          set.workoutId !== workout.id ||
          set.exercise !== target.exercise ||
          step?.exercise !== set.exercise
        )
          continue;
        amount += target.goal.type === 'seconds' ? set.heldMs / 1000 : set.reps;
        counted.push(set);
      }
      finalShare = setShare(target.goal, amount);
      // A later try under an edited target cannot undo an already completed day.
      done ||= finalShare >= 1;
    }
    return { done, share: done ? 1 : finalShare, shown: latest, total: amount, sets: counted };
  }

  const results = tries.map((workout) => ({ workout, share: workoutShare(input, workout) }));
  const shown = results.findLast(({ share }) => share >= 1) ?? results[results.length - 1];
  return {
    done: shown.share >= 1,
    share: shown.share,
    shown: shown.workout,
    sets: input.sets.filter((set) => set.workoutId === shown.workout.id),
  };
}

/**
 * History through today (or finish/leave), including missed stretches; numbers reset after a miss.
 * The last day remains active until midnight; before joining the current day number is zero.
 */
export function runCalendar(input: ProgressInput, today: Day): { days: RunDay[]; state: RunState } {
  const { run, version } = input;
  const left = run.endReason === 'left' && run.endedOn !== null && run.endedOn <= today;
  const until = left && run.endedOn !== null ? run.endedOn : today;
  const days: RunDay[] = [];
  let from = run.startedOn;
  let number = 0;
  let finished = false;

  for (let day = run.startedOn; day <= until; day = addDays(day, 1)) {
    if (number === version.days) {
      finished = true;
      break;
    }
    number += 1;
    const result = dayResult(input, day);
    days.push({ day, number, from, result });
    // Only a closed calendar day can be missed. A leave freezes the run on its final day.
    if (day < until && version.restartOnMiss && !result.done) {
      from = addDays(day, 1);
      number = 0;
    }
  }
  return {
    days,
    state: { state: finished ? 'finished' : left ? 'left' : 'active', day: number, from },
  };
}
