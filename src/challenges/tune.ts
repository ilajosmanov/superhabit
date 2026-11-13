import { DAY_CHOICES, RANGE, unitOf, type Amount } from './draft';
import { isHold } from './hold';
import { resizeSchedule } from '@/workout/plan/schedule';
import type { ExerciseId } from '@/exercises/registry';
import {
  defineChallenge,
  MAX,
  MAX_DAYS,
  MAX_SETS,
  reps,
  seconds,
  setsIn,
  type Challenge,
  type ScheduledDay,
} from '@/workout/plan/plan';

/** One number you can change. Keys follow positions, so changing numbers keeps them stable. */
export type Knob =
  | { key: string; kind: 'reps' | 'seconds'; exercise: ExerciseId; block: number; ours: Amount }
  | { key: string; kind: 'rest'; block: number; ours: number }
  | { key: string; kind: 'rounds'; block: number; ours: number }
  | { key: 'days'; kind: 'days'; ours: number };
export type Values = Readonly<Record<string, Amount>>;

const stepKey = (block: number, step: number) => `${block}:step:${step}`;
const roundsKey = (block: number) => `${block}:rounds`;

/** Exercise and timed recovery amounts, then rounds for each block; days last. */
export function knobsOf(challenge: Challenge): Knob[] {
  const knobs: Knob[] = [];
  challenge.session.forEach((block, b) => {
    block.steps.forEach(({ exercise, goal }, s) => {
      if (exercise === 'rest' && goal.type === 'seconds') {
        knobs.push({ key: stepKey(b, s), kind: 'rest', block: b, ours: goal.n });
      } else if (exercise !== 'rest') {
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

/** The remaining workout capacity belongs to this block; rests never log sets. */
export function limitOf(challenge: Challenge, knob: Knob, values: Values): number {
  if (knob.kind === 'days') return MAX_DAYS;
  if (knob.kind !== 'rounds') return Infinity;
  const session = mapNonempty(challenge.session, (block, b) => ({
    ...block,
    rounds: b === knob.block ? 0 : count(values[roundsKey(b)] ?? block.rounds),
  }));
  const exercises = setsIn([{ ...challenge.session[knob.block], rounds: 1 }]);
  return Math.floor((MAX_SETS - setsIn(session)) / exercises);
}

/** Apply slider and typed edits through the same limits before a preview or save can run. */
export function withValue(
  challenge: Challenge,
  values: Values,
  knob: Knob,
  amount: Amount,
): Values {
  const value =
    knob.kind === 'rounds' || knob.kind === 'days'
      ? Math.min(count(amount), limitOf(challenge, knob, values))
      : amount;
  return { ...values, [knob.key]: value };
}

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
  const range = RANGE[knob.kind === 'rest' ? 'seconds' : knob.kind];
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
export function tuned(
  challenge: Challenge,
  values: Values,
  pattern: readonly ScheduledDay[] | null = null,
): Challenge {
  const session = mapNonempty(challenge.session, (block, b) => ({
    ...block,
    rounds: count(values[roundsKey(b)] ?? block.rounds),
    steps: mapNonempty(block.steps, (step, s) => {
      const amount = values[stepKey(b, s)];
      if (amount === undefined) return step;
      if (step.exercise === 'rest') {
        if (amount === 'max') throw new Error('timed recovery cannot be Max');
        return { ...step, goal: seconds(amount) };
      }
      const goal = amount === 'max' ? MAX : isHold(step.exercise) ? seconds(amount) : reps(amount);
      return { ...step, goal };
    }),
  }));
  const last = session.at(-1);
  if (last?.rounds === 1 && last.steps.length > 1 && last.steps.at(-1)?.exercise === 'rest') {
    const [first, ...steps] = last.steps.slice(0, -1);
    if (first) session[session.length - 1] = { ...last, steps: [first, ...steps] };
  }
  const days = count(values.days ?? challenge.days);
  return defineChallenge({
    ...challenge,
    days,
    session,
    ...(challenge.schedule && { schedule: resizeSchedule(pattern ?? challenge.schedule, days) }),
  });
}

/**
 * Flip one day of the calendar as shown between workout and rest: your pattern, or null when it is ours
 * again. The last workout day stays one, since a calendar needs a workout.
 */
export function flipDay(
  challenge: Challenge,
  shown: readonly ScheduledDay[],
  day: number,
): ScheduledDay[] | null {
  const next = shown.map((d, i): ScheduledDay =>
    i !== day ? d : d === 'rest' ? 'training' : 'rest',
  );
  if (!next.includes('training')) return [...shown];
  const ours = challenge.schedule && resizeSchedule(challenge.schedule, next.length);
  return ours?.every((d, i) => d === next[i]) ? null : next;
}
