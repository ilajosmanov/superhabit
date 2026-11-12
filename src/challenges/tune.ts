import { DAY_CHOICES, RANGE, unitOf, type Amount } from './draft';
import { isHold } from './hold';
import type { ExerciseId } from '@/exercises/registry';
import { defineChallenge, MAX, reps, seconds, type Challenge } from '@/workout/plan/plan';

/** One number you can change. Keys follow positions, so changing numbers keeps them stable. */
export type Knob =
  | { key: string; kind: 'reps' | 'seconds'; exercise: ExerciseId; block: number; ours: Amount }
  | { key: string; kind: 'rounds'; block: number; ours: number }
  | { key: 'days'; kind: 'days'; ours: number };
export type Values = Readonly<Record<string, Amount>>;

const stepKey = (block: number, step: number) => `${block}:step:${step}`;
const roundsKey = (block: number) => `${block}:rounds`;

/** Exercise amounts, then rounds for each block; days last. Rests stay fixed. */
export function knobsOf(challenge: Challenge): Knob[] {
  const knobs: Knob[] = [];
  challenge.session.forEach((block, b) => {
    block.steps.forEach(({ exercise, goal }, s) => {
      if (exercise !== 'rest') {
        knobs.push({
          key: stepKey(b, s),
          kind: unitOf(exercise),
          exercise,
          block: b,
          ours: goal.type === 'max' ? 'max' : goal.n,
        });
      }
    });
    // A daily total is one set, so it has no rounds to change.
    if (!challenge.dailyTotal) {
      knobs.push({ key: roundsKey(b), kind: 'rounds', block: b, ours: block.rounds });
    }
  });
  return [...knobs, { key: 'days', kind: 'days', ours: challenge.days }];
}

export const valueOf = (knob: Knob, values: Values): Amount => values[knob.key] ?? knob.ours;

/** Days and rounds are counts, never open-ended goals. */
function count(value: Amount): number {
  if (value === 'max') throw new Error('days and rounds cannot be Max');
  return value;
}

/** Keep the original number exactly on a stop, including small ladder rungs and typed goals. */
export function rangeOf(knob: Knob): { min: number; max: number; step: number } {
  if (knob.kind === 'rounds' || knob.kind === 'days') {
    return { min: 1, max: Math.max(knob.kind === 'rounds' ? 10 : 30, knob.ours), step: 1 };
  }
  const range = RANGE[knob.kind];
  if (knob.ours === 'max') return range;
  if (
    knob.ours >= range.min &&
    knob.ours <= range.max &&
    (knob.ours - range.min) % range.step === 0
  ) {
    return range;
  }
  return { min: 1, max: Math.max(range.max, knob.ours), step: 1 };
}

export const dayChoices = (ours: number): number[] =>
  [...new Set<number>([...DAY_CHOICES, ours])].sort((a, b) => a - b);

/** Preserve the plan's nonempty blocks and steps without a type assertion. */
function mapNonempty<T>(
  [first, ...rest]: readonly [T, ...T[]],
  map: (value: T, index: number) => T,
): [T, ...T[]] {
  return [map(first, 0), ...rest.map((value, index) => map(value, index + 1))];
}

/**
 * Swap only numbers, preserving the plan's shape and validating the resulting challenge. A last block
 * cut to one round drops its closing rest: the run never takes it, and validate rejects a plan that ends on one.
 */
export function tuned(challenge: Challenge, values: Values): Challenge {
  const session = mapNonempty(challenge.session, (block, b) => ({
    ...block,
    rounds: count(values[roundsKey(b)] ?? block.rounds),
    steps: mapNonempty(block.steps, (step, s) => {
      const amount = values[stepKey(b, s)];
      if (step.exercise === 'rest' || amount === undefined) return step;
      const goal = amount === 'max' ? MAX : isHold(step.exercise) ? seconds(amount) : reps(amount);
      return { ...step, goal };
    }),
  }));
  const last = session.at(-1);
  if (last?.rounds === 1 && last.steps.length > 1 && last.steps.at(-1)?.exercise === 'rest') {
    const [first, ...steps] = last.steps.slice(0, -1);
    if (first) session[session.length - 1] = { ...last, steps: [first, ...steps] };
  }
  return defineChallenge({ ...challenge, days: count(values.days ?? challenge.days), session });
}
