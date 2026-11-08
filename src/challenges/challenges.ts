import { EXERCISES, orientation, type ExerciseId, type Placement } from '@/exercises/registry';

import {
  defineChallenge,
  expand,
  MAX,
  reps,
  seconds,
  type Challenge,
  type Goal,
  type Step,
} from '@/workout/plan';

/** Which way the phone stands, as mono labels say it. */
export const phoneWay = (placement: Placement) =>
  orientation(placement) === 'landscape' ? 'SIDEWAYS' : 'UPRIGHT';

export const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** One exercise, the same goal every day. */
const daily = (name: string, days: number, exercise: ExerciseId, goal: Goal): Challenge => ({
  name,
  days,
  restartOnMiss: false,
  session: [{ steps: [{ exercise, goal }], rounds: 1 }],
});
const rest = (n: number) => ({ exercise: 'rest', goal: seconds(n) }) as const;
/** A ladder rung: n push-ups, n sit-ups, then whatever follows (a rest, except on the last rung). */
const rung = (n: number, ...then: Step[]): Challenge['session'][number] => ({
  steps: [{ exercise: 'pushup', goal: reps(n) }, { exercise: 'situp', goal: reps(n) }, ...then],
  rounds: 1,
});

// shortcut: testing goals, a minute or two each; the real ones (and the daily basics) are at git tag
// `real-goals`. Put them back before pilot users get the app.
/** Ours, joined as-is: circuits only. Route id -> challenge, in catalog order. */
const suggested: [string, Challenge][] = [
  // Circuits keep the phone in one spot, or move it once.
  [
    'floor-circuit',
    {
      name: 'Floor circuit',
      days: 14,
      restartOnMiss: false,
      session: [
        {
          steps: [
            { exercise: 'pushup', goal: reps(3) },
            { exercise: 'situp', goal: reps(3) },
            { exercise: 'glute-bridge', goal: reps(3) },
            { exercise: 'plank', goal: seconds(10) },
            rest(10),
          ],
          rounds: 2,
        },
      ],
    },
  ],
  [
    'standing-circuit',
    {
      name: 'Standing circuit',
      days: 14,
      restartOnMiss: false,
      session: [
        {
          steps: [
            { exercise: 'squat', goal: reps(3) },
            { exercise: 'jumping-jack', goal: reps(5) },
            rest(10),
          ],
          rounds: 2,
        },
      ],
    },
  ],
  [
    'floor-ladder',
    {
      name: 'Floor ladder',
      days: 14,
      restartOnMiss: false,
      // Climbs to 2 push-ups and 2 sit-ups and back down.
      session: [rung(1, rest(10)), rung(2, rest(10)), rung(1)],
    },
  ],
  // Cindy's push-ups and squats without the bar or the clock; the phone moves once, between blocks.
  [
    'five-ten-fifteen',
    {
      name: '5-10-15',
      days: 14,
      restartOnMiss: false,
      session: [
        { steps: [{ exercise: 'pushup', goal: reps(3) }, rest(10)], rounds: 2 },
        { steps: [{ exercise: 'squat', goal: reps(3) }, rest(10)], rounds: 2 },
      ],
    },
  ],
];

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
];

/** The catalog, in order. */
export const SUGGESTED: ReadonlyMap<string, Challenge> = new Map(
  suggested.map(([id, challenge]) => [id, defineChallenge(challenge)]),
);

/** Every route id: the suggested challenges, then the one-go sets. */
export const CHALLENGES: ReadonlyMap<string, Challenge> = new Map([
  ...SUGGESTED,
  ...ONE_GO.map((exercise): [string, Challenge] => [
    exercise,
    defineChallenge(daily(capitalise(EXERCISES[exercise].name), 1, exercise, MAX)),
  ]),
]);

/** Describe each block once, with its round count; rests do not contribute exercise goals. */
export function summary({ session }: Challenge): string {
  const blocks = session.flatMap(({ steps, rounds }) => {
    const texts = steps.flatMap(({ exercise, goal }) => {
      if (exercise === 'rest') return [];
      const { name, kind } = EXERCISES[exercise];
      return goal.type === 'reps'
        ? `${goal.n} ${name}`
        : goal.type === 'seconds'
          ? `${name} ${goal.n} s`
          : `${name}, as ${kind === 'hold' ? 'long' : 'many'} as you can`;
    });
    return texts.length ? `${rounds > 1 ? `${rounds} rounds: ` : ''}${texts.join(', then ')}` : [];
  });
  return capitalise(blocks.join(', then '));
}

/** Clean reps across expanded exercise steps; an open-ended rep goal makes the total unlimited. */
export const totalReps = ({ session }: Challenge) =>
  expand(session).reduce((total, { exercise, goal }) => {
    if (exercise === 'rest' || EXERCISES[exercise].kind === 'hold') return total;
    return total + (goal.type === 'max' ? Infinity : goal.type === 'reps' ? goal.n : 0);
  }, 0);

/** Detector-clock seconds across expanded hold steps; a MAX hold makes the total unlimited. */
export const totalSeconds = ({ session }: Challenge) =>
  expand(session).reduce((total, { exercise, goal }) => {
    if (exercise === 'rest' || EXERCISES[exercise].kind !== 'hold') return total;
    return total + (goal.type === 'max' ? Infinity : goal.type === 'seconds' ? goal.n : 0);
  }, 0);

/** What the detail screen says about a challenge before it starts. */
export function detail(challenge: Challenge) {
  const steps = expand(challenge.session);
  const sets = steps.filter((step) => step.exercise !== 'rest');
  const reps = totalReps(challenge);
  const countsReps = reps > 0;
  const total = countsReps ? reps : totalSeconds(challenge);
  const holds = sets.some((set) => EXERCISES[set.exercise].kind === 'hold');
  const tracking = !countsReps
    ? 'The camera times your hold. Stay in position to keep the clock running.'
    : holds
      ? 'The camera counts full-range reps and times your holds.'
      : 'The camera counts. Only full-range reps score.';
  const placements = new Set(sets.map((set) => orientation(EXERCISES[set.exercise].placement)));
  // The run explains each later set's setup between sets; the first one is explained here.
  const first = EXERCISES[steps[0].exercise];
  const phone = placements.size > 1 ? 'ROTATES' : phoneWay(first.placement);
  return { sets, total, countsReps, tracking, phone, first };
}

/** An exercise step as the plan lists it, goal per round; `move` is where the phone goes first, when it moves. */
export type PlanRow = { exercise: ExerciseId; goal: Goal; move?: string };

const restLabel = (goal: Goal) => (goal.type === 'seconds' ? `${goal.n} S REST` : 'REST');
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * The session as the challenge page lists it: each block as a part whose label says its rounds and rest
 * once, its exercise rows, and a phone line wherever the phone moves. `single` is the one row of a
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
    return { label, rows };
  });
  const only = parts.length === 1 && session[0].rounds === 1 ? parts[0].rows : [];
  return {
    parts,
    /** Each exercise once, in the order you first do it. */
    exercises: [...new Set(parts.flatMap(({ rows }) => rows.map((row) => row.exercise)))],
    single: only.length === 1 ? only[0] : null,
  };
}
