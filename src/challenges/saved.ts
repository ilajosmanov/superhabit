import { z } from 'zod';

import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import { addDays, type Day } from './days';
import { defineChallenge, type Challenge } from '@/workout/plan';

/**
 * A challenge you joined or made, and its run. `id` is a suggested challenge's own id (joined as-is or
 * edited), or a fresh one for a challenge you made. Exercises are stored by id only, never thresholds.
 */
export type Saved = { id: string; challenge: Challenge; startedOn: Day; done: readonly Day[] };

/** Bump when the stored shape changes, and read the older version in `parse`. */
const VERSION = 1;

// The file is a trust boundary: every field is checked, nothing is cast.
// Round-tripping through the calendar rejects days that don't exist, like 2026-02-30.
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { abort: true })
  .refine((v) => addDays(v, 0) === v);
// shortcut: no real challenge runs longer or repeats more; raise it if one ever does. A bigger number is
// a broken file: `abort` stops it before defineChallenge would expand a billion rounds and hang the app.
const count = z.number().max(1000, { abort: true });
const max = z.object({ type: z.literal('max') });
const timed = z.object({ type: z.literal('seconds'), n: z.number() });
const goal = z.union([max, timed, z.object({ type: z.literal('reps'), n: z.number() })]);
// An exercise we no longer ship drops the challenge instead of crashing the app.
const exercise = z.custom<ExerciseId>((v) => typeof v === 'string' && Object.hasOwn(EXERCISES, v));
const step = z.union([
  z.object({ exercise, goal }),
  z.object({ exercise: z.literal('rest'), goal: z.union([max, timed]) }),
]);
const block = z.object({ steps: z.tuple([step], step), rounds: count });
const challenge = z
  .object({
    name: z.string(),
    days: count,
    restartOnMiss: z.boolean(),
    session: z.tuple([block], block),
  })
  // Goals the exercise can't take, rest in the wrong place, bad counts.
  .refine((c) => {
    try {
      return Boolean(defineChallenge(c));
    } catch {
      return false;
    }
  });
const saved: z.ZodType<Saved> = z.object({
  id: z.string(),
  challenge,
  startedOn: day,
  done: z.array(day),
});
const file = z.object({ version: z.literal(VERSION), challenges: z.array(z.unknown()) });

export const serialise = (value: readonly Saved[]) =>
  JSON.stringify({ version: VERSION, challenges: value });

/**
 * The challenges in a saved file's text. `complete` is false when any of it could not be read (bad JSON,
 * an unknown version, a broken or duplicate entry), so the caller can keep the original before saving over it.
 */
export function parse(text: string): { value: Saved[]; complete: boolean } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { value: [], complete: false };
  }
  const read = file.safeParse(json);
  if (!read.success) return { value: [], complete: false };
  const value: Saved[] = [];
  for (const item of read.data.challenges) {
    const entry = saved.safeParse(item);
    if (entry.success && !value.some(({ id }) => id === entry.data.id)) value.push(entry.data);
  }
  return { value, complete: value.length === read.data.challenges.length };
}
