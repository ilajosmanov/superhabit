import { EXERCISES, orientation, type ExerciseId, type Placement } from '@/exercises/registry';

import { defineChallenge, expand, MAX, type Challenge, type Goal } from '@/workout/plan';

/** Which way the phone stands, as mono labels say it. */
export const phoneWay = (placement: Placement) =>
  orientation(placement) === 'landscape' ? 'SIDEWAYS' : 'UPRIGHT';

export const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The exercises we offer on their own, in tile order: what the surprise card draws from (each once, as
 * many as you can; route id = exercise id) and what a new challenge is built on.
 */
export const ONE_GO: readonly ExerciseId[] = [
  'pushup',
  'squat',
  'plank',
  'situp',
  'lunge',
  'glute-bridge',
  'jumping-jack',
  'leg-raise',
  'wall-sit',
  'burpee',
];

/** One go at an exercise, as many as you can: what the surprise card and a free log start. */
export const oneGo = (exercise: ExerciseId) =>
  defineChallenge({
    name: capitalise(EXERCISES[exercise].name),
    days: 1,
    restartOnMiss: false,
    dailyTotal: false,
    session: [{ steps: [{ exercise, goal: MAX }], rounds: 1 }],
  });

/** A challenge's exercise sets in session order, and how the camera tracks them, as the page says it. */
export function detail(challenge: Challenge) {
  const sets = expand(challenge.session).filter((step) => step.exercise !== 'rest');
  const holds = sets.filter((set) => EXERCISES[set.exercise].kind === 'hold').length;
  const tracking =
    holds === sets.length
      ? 'The camera times your hold. Stay in position to keep the clock running.'
      : holds > 0
        ? 'The camera counts full-range reps and times your holds.'
        : 'The camera counts. Only full-range reps score.';
  return { sets, tracking };
}

/** An exercise step as the plan lists it, goal per round; `move` is where the phone goes first, when it moves. */
export type PlanRow = { exercise: ExerciseId; goal: Goal; move?: string };

const restLabel = (goal: Goal) => (goal.type === 'seconds' ? `${goal.n} S REST` : 'REST');
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * The session as the challenge page lists it: each block as a part whose label says its rounds and rest
 * once, its exercise rows (each done `rounds` times, rows in order within a round, as the run goes), and
 * a phone line wherever the phone moves. `single` is the one row of a
 * one-exercise, one-round session, which the page shows as a numeral.
 */
export function plan({ session }: Challenge) {
  let placement: Placement | null = null;
  const parts = session.map((block, i) => {
    const between = block.rounds > 1 ? 'BETWEEN' : 'AFTER';
    const rests = new Set(
      block.steps.flatMap((step) => (step.exercise === 'rest' ? restLabel(step.goal) : [])),
    );
    const label = [
      ...(session.length > 1 ? [`PART ${i + 1}`] : []),
      ...(block.rounds > 1 ? [`${block.rounds} ROUNDS`] : []),
      ...[...rests].map((rest) => `${rest} ${between}`),
    ].join(' · ');
    const rows = block.steps.flatMap((step): PlanRow[] => {
      if (step.exercise === 'rest') return [];
      const exercise = EXERCISES[step.exercise];
      let move: string | undefined;
      if (exercise.placement !== placement) {
        move = placement === null ? exercise.place : `Then ${lowerFirst(exercise.place)}`;
        placement = exercise.placement;
      }
      return [{ exercise: step.exercise, goal: step.goal, ...(move && { move }) }];
    });
    return { label, rounds: block.rounds, rows };
  });
  const only = parts.length === 1 && session[0].rounds === 1 ? parts[0].rows : [];
  return {
    parts,
    /** Each exercise once, in the order you first do it. */
    exercises: [...new Set(parts.flatMap(({ rows }) => rows.map((row) => row.exercise)))],
    single: only.length === 1 ? only[0] : null,
  };
}
