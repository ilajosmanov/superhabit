import { EXERCISES, type ExerciseId, type Progress } from '@/exercises/registry';

export type Goal = { type: 'reps'; n: number } | { type: 'seconds'; n: number } | { type: 'max' };
export type RestGoal = Extract<Goal, { type: 'seconds' | 'max' }>;
export type ExerciseStep = { exercise: ExerciseId; goal: Goal };
export type RestStep = { exercise: 'rest'; goal: RestGoal };
export type Step = ExerciseStep | RestStep;
export type Block = { steps: readonly [Step, ...Step[]]; rounds: number };
export type Session = readonly [Block, ...Block[]];
export type Challenge = { name: string; days: number; restartOnMiss: boolean; session: Session };
/** Block and round numbers are 1-based. */
export type FlatStep = Step & { block: number; round: number; rounds: number };
export type FlatSteps = readonly [ExerciseStep & FlatStep, ...FlatStep[]];

export const reps = (n: number): Goal => ({ type: 'reps', n });
export const seconds = (n: number) => ({ type: 'seconds', n }) as const;
export const MAX = { type: 'max' } as const;

const positiveInteger = (n: number) => Number.isInteger(n) && n >= 1;

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
  return problems;
}

/** Expand blocks and rounds, dropping only the final rest of the whole session. */
export function expand(session: Session): FlatSteps {
  const problems = validate(session);
  if (problems.length > 0) throw new Error(problems.join('\n'));
  const steps = flatten(session);
  if (steps.at(-1)?.exercise === 'rest') steps.pop();
  const [first, ...remaining] = steps;
  if (!first || first.exercise === 'rest') throw new Error('session must start with an exercise');
  return [first, ...remaining];
}

export function defineChallenge(c: Challenge): Challenge {
  const problems = validate(c.session);
  if (!positiveInteger(c.days)) problems.push('days must be an integer >= 1');
  if (problems.length > 0) throw new Error(problems.join('\n'));
  return c;
}

export function done(goal: Goal, p: Progress): boolean {
  switch (goal.type) {
    case 'reps':
      return p.reps >= goal.n;
    case 'seconds':
      return p.heldMs >= goal.n * 1000;
    case 'max':
      return p.broken;
  }
}
