import { z } from 'zod';

import { EXERCISES, isExerciseId, type ExerciseId, type Progress } from '@/exercises/registry';

export type Goal = { type: 'reps'; n: number } | { type: 'seconds'; n: number } | { type: 'max' };
type RestGoal = Extract<Goal, { type: 'seconds' | 'max' }>;
export type ExerciseStep = { exercise: ExerciseId; goal: Goal };
type RestStep = { exercise: 'rest'; goal: RestGoal };
export type Step = ExerciseStep | RestStep;
export type Block = { steps: readonly [Step, ...Step[]]; rounds: number };
export type Session = readonly [Block, ...Block[]];
/** Calendar days, distinct from timed rests inside a session. */
export type ScheduledDay = 'training' | 'rest';
export type Challenge = {
  name: string;
  days: number;
  restartOnMiss: boolean;
  /** Every done workout of the day adds up toward the one set's target. */
  dailyTotal: boolean;
  session: Session;
  /** Explicit calendar, one entry per day. Absent means the session is due every day. */
  schedule?: readonly ScheduledDay[];
};
/** Block and round numbers are 1-based. */
type FlatStep = Step & { block: number; round: number; rounds: number };
export type FlatSteps = readonly [ExerciseStep & FlatStep, ...FlatStep[]];

export const reps = (n: number): Goal => ({ type: 'reps', n });
export const seconds = (n: number) => ({ type: 'seconds', n }) as const;
export const MAX = { type: 'max' } as const;

/** A goal in its own unit, as cards and lists show it: "×25", "60S", "MAX". */
export const goalLabel = (goal: Goal) =>
  goal.type === 'reps' ? `×${goal.n}` : goal.type === 'seconds' ? `${goal.n}S` : 'MAX';

const positiveInteger = (n: number) => Number.isInteger(n) && n >= 1;

/** The most sets (exercise steps) one workout may hold; the server refuses a bigger workout. */
export const MAX_SETS = 200;
/** The longest challenge; the server refuses a longer one, so a run's calendar stays cheap to walk. */
export const MAX_DAYS = 365;

/** Sets one workout of the session logs (rests log none), counted without expanding the rounds. */
export const setsIn = (session: Session) =>
  session.reduce(
    (sum, block) => sum + block.rounds * block.steps.filter((s) => s.exercise !== 'rest').length,
    0,
  );

const maxGoal = z.strictObject({ type: z.literal('max') });
const secondsGoal = z.strictObject({ type: z.literal('seconds'), n: z.number().int().positive() });
const goalSchema = z.union([
  maxGoal,
  secondsGoal,
  z.strictObject({ type: z.literal('reps'), n: z.number().int().positive() }),
]);
const exerciseSchema = z.custom<ExerciseId>(isExerciseId);
const stepSchema = z.union([
  z.strictObject({ exercise: exerciseSchema, goal: goalSchema }),
  z.strictObject({ exercise: z.literal('rest'), goal: z.union([maxGoal, secondsGoal]) }),
]);
const blockSchema = z.strictObject({
  steps: z.tuple([stepSchema], stepSchema),
  // shortcut: at most 1000 rounds; raise when a real plan needs more.
  rounds: z.number().int().positive().max(1000),
});
const sessionSchema = z.tuple([blockSchema], blockSchema);

/** A stored set's goal; null for one this app can't read. */
export const readGoal = (json: unknown): Goal | null => goalSchema.safeParse(json).data ?? null;

/** Unknown exercises/shapes and invalid known plans cannot be started by this app. */
export function readPlan(json: unknown): Session | null {
  const parsed = sessionSchema.safeParse(json);
  if (!parsed.success || validate(parsed.data).length > 0) return null;
  return parsed.data;
}

const scheduledPlanSchema = z.strictObject({
  type: z.literal('scheduled'),
  session: sessionSchema,
  schedule: z.array(z.enum(['training', 'rest'])).min(1),
});

/** Old apps reject the object envelope rather than silently treating recovery as a workout day. */
export function readChallengePlan(
  json: unknown,
  days: number,
): Pick<Challenge, 'session' | 'schedule'> | null {
  const session = readPlan(json);
  if (session) return { session };
  const parsed = scheduledPlanSchema.safeParse(json);
  if (!parsed.success) return null;
  const plan = parsed.data;
  if (
    plan.schedule.length !== days ||
    !plan.schedule.includes('training') ||
    validate(plan.session).length > 0
  )
    return null;
  return { session: plan.session, schedule: plan.schedule };
}

export const storedPlan = ({ session, schedule }: Pick<Challenge, 'session' | 'schedule'>) =>
  schedule ? { type: 'scheduled' as const, session, schedule } : session;

function flatten(session: Session): FlatStep[] {
  const steps: FlatStep[] = [];
  session.forEach((block, index) => {
    // Invalid rounds are reported by validate; never iterate an invalid bound (especially Infinity).
    if (!positiveInteger(block.rounds)) return;
    for (let round = 1; round <= block.rounds; round += 1) {
      for (const step of block.steps) {
        steps.push({ ...step, block: index + 1, round, rounds: block.rounds });
      }
    }
  });
  return steps;
}

/** Report every invalid goal, round count and rest join in a session. */
export function validate(session: Session): string[] {
  // Checked before flattening: a synced plan of 1000 rounds of many steps must not be expanded. Rests
  // never sit side by side, so a valid workout has at most one per set.
  const steps = session.reduce((sum, block) => sum + block.rounds * block.steps.length, 0);
  if (setsIn(session) > MAX_SETS || steps > 2 * MAX_SETS) {
    return [`a workout holds at most ${MAX_SETS} sets`];
  }
  const problems: string[] = [];
  session.forEach((block, blockIndex) => {
    if (!positiveInteger(block.rounds)) {
      problems.push(`block ${blockIndex + 1}: rounds must be an integer >= 1`);
    }
    block.steps.forEach(({ exercise, goal }, stepIndex) => {
      const at = `block ${blockIndex + 1} step ${stepIndex + 1}`;
      if (goal.type !== 'max' && !positiveInteger(goal.n)) {
        problems.push(`${at}: ${goal.type} must be an integer >= 1`);
      }
      if (exercise === 'rest' || goal.type === 'max') return;
      const hold = EXERCISES[exercise].kind === 'hold';
      if (hold && goal.type === 'reps') {
        problems.push(`${at}: ${exercise} takes seconds or max, not reps`);
      } else if (!hold && goal.type === 'seconds') {
        problems.push(`${at}: ${exercise} takes reps or max, not seconds`);
      }
    });
  });

  let previousRest = false;
  flatten(session).forEach((step, index) => {
    const rest = step.exercise === 'rest';
    if (rest && index === 0) problems.push('session must start with an exercise, not rest');
    if (rest && previousRest) {
      problems.push(`block ${step.block} round ${step.round}: two rests in a row`);
    }
    previousRest = rest;
  });
  // The run drops the final rest, so a list of the plan would show a rest that never happens.
  const last = session[session.length - 1];
  if (last.rounds === 1 && last.steps[last.steps.length - 1].exercise === 'rest') {
    problems.push('session must end with an exercise, not rest');
  }
  return problems;
}

/** Expand blocks and rounds of a validated session, dropping only the final rest of the whole session. */
export function expand(session: Session): FlatSteps {
  const steps = flatten(session);
  if (steps.at(-1)?.exercise === 'rest') steps.pop();
  const [first, ...remaining] = steps;
  // Never true after validate; it narrows the first step to an exercise without a type assertion.
  if (!first || first.exercise === 'rest') throw new Error('session must start with an exercise');
  return [first, ...remaining];
}

export function defineChallenge(c: Challenge): Challenge {
  const problems = validate(c.session);
  if (!positiveInteger(c.days) || c.days > MAX_DAYS) {
    problems.push(`days must be an integer from 1 to ${MAX_DAYS}`);
  }
  if (
    c.schedule &&
    (c.schedule.length !== c.days ||
      !c.schedule.includes('training') ||
      c.schedule.some((day) => day !== 'training' && day !== 'rest'))
  ) {
    problems.push(
      'schedule needs one training or rest entry per day and at least one training day',
    );
  }
  if (c.dailyTotal) {
    const sets = flatten(c.session).filter((step) => step.exercise !== 'rest');
    if (sets.length !== 1) problems.push('daily total needs exactly one exercise set');
    if (sets.some(({ goal }) => goal.type === 'max')) {
      problems.push('daily total cannot have a MAX goal');
    }
  }
  if (problems.length > 0) throw new Error(problems.join('\n'));
  return c;
}

/** A rep or seconds goal reached; an open-ended one never is. */
export const reached = (goal: Goal, { reps, heldMs }: Pick<Progress, 'reps' | 'heldMs'>) =>
  goal.type === 'reps' ? reps >= goal.n : goal.type === 'seconds' && heldMs >= goal.n * 1000;

/** A live set is over: its goal reached, or an open-ended one broken off. */
export const done = (goal: Goal, p: Progress) =>
  goal.type === 'max' ? p.broken : reached(goal, p);
