import type { BodyPart, Phase } from '@/exercises/registry';

import type { Goal } from '@/workout/plan/plan';

/** Every this many counted reps the count gets a "keep going". */
const ENCOURAGE_EVERY = 5;

/** What to say when counts change; null = stay silent (no change, or reset). */
export function repPhrase(
  prev: { reps: number; noReps: number },
  next: { reps: number; noReps: number },
  cues?: readonly string[],
): string | null {
  if (next.reps > prev.reps)
    return next.reps % ENCOURAGE_EVERY === 0 ? `${next.reps}, keep going` : String(next.reps);
  if (next.noReps > prev.noReps) return cues?.[0] ?? 'Deeper';
  return null;
}

type Next = { rest: number | null } | { what: string; place: string | null };

/** Said at the end of an exercise step: the amount completed, then what comes next. */
export function setPhrase(done: string, next: Next | null): string {
  if (!next) return `${done}. Challenge done.`;
  if ('rest' in next)
    return next.rest === null
      ? `${done}, set done. Rest.`
      : `${done}, set done. Rest ${next.rest} seconds.`;
  if (next.place === null) return `${done}. Next, ${next.what}.`;
  return `${done}, set done. Next, ${next.what}. ${next.place}.`;
}

/** The step after a set, as said aloud: `name` is null for a rest, `place` null when the phone stays put. */
type Upcoming = { name: string | null; goal: Goal; place: string | null };

/** Said as a set ends; `cue` is the form cue that broke a MAX hold, said first so speech can't cut it. */
export function endPhrase(amount: string, next: Upcoming | null, cue: string | null): string {
  const text = setPhrase(
    amount,
    !next
      ? null
      : next.name === null
        ? { rest: next.goal.type === 'seconds' ? next.goal.n : null }
        : {
            what:
              next.goal.type === 'reps'
                ? `${next.goal.n} ${next.name}`
                : next.goal.type === 'seconds'
                  ? `${next.name} ${next.goal.n} seconds`
                  : next.name,
            place: next.place,
          },
  );
  return cue ? `${cue}. ${text}` : text;
}

/** 'Go' as the counter first sees the start position; null otherwise. */
export const startPhrase = (prev: Phase, next: Phase) =>
  prev === 'waiting' && next !== 'waiting' ? 'Go' : null;

/** Names the first part out of frame; null when all are in. */
export function framePhrase(missing: readonly BodyPart[]): string | null {
  const [part] = missing;
  return part ? `Your ${part} ${part === 'head' ? 'is' : 'are'} out of frame` : null;
}
