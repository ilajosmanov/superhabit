import { EXERCISES, orientation, type ExerciseId, type Placement } from '@/exercises/registry';

import { defineChallenge, expand, MAX, reps, seconds, type Challenge } from '@/workout/plan';

/** Which way the phone stands, as mono labels say it. */
export const phoneWay = (placement: Placement) =>
  orientation(placement) === 'landscape' ? 'SIDEWAYS' : 'UPRIGHT';

export const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// shortcut: fixed goals lowered for physical testing (reps 3, plank 10 s); restore the real numbers
// (50 push-ups, 100 squats, 60 s plank) before release.
/** Ours, one exercise each, joined as-is. Route id -> challenge, in catalog order. */
const suggested: [string, Challenge][] = [
  [
    'pushup-fifty',
    {
      name: 'Push-up fifty',
      days: 21,
      restartOnMiss: false,
      session: [{ steps: [{ exercise: 'pushup', goal: reps(3) }], rounds: 1 }],
    },
  ],
  [
    'squat-hundred',
    {
      name: 'Squat hundred',
      days: 21,
      restartOnMiss: false,
      session: [{ steps: [{ exercise: 'squat', goal: reps(3) }], rounds: 1 }],
    },
  ],
  [
    'plank-minute',
    {
      name: 'Plank minute',
      days: 21,
      restartOnMiss: false,
      session: [{ steps: [{ exercise: 'plank', goal: seconds(10) }], rounds: 1 }],
    },
  ],
  // Open-ended: a miscount never blocks the day.
  [
    'situp-max',
    {
      name: 'Sit-ups',
      days: 14,
      restartOnMiss: false,
      session: [{ steps: [{ exercise: 'situp', goal: MAX }], rounds: 1 }],
    },
  ],
  [
    'lunge-max',
    {
      name: 'Lunges',
      days: 14,
      restartOnMiss: false,
      session: [{ steps: [{ exercise: 'lunge', goal: MAX }], rounds: 1 }],
    },
  ],
  [
    'glute-bridge-max',
    {
      name: 'Glute bridges',
      days: 14,
      restartOnMiss: false,
      session: [{ steps: [{ exercise: 'glute-bridge', goal: MAX }], rounds: 1 }],
    },
  ],
  [
    'jumping-jack-max',
    {
      name: 'Jumping jacks',
      days: 14,
      restartOnMiss: false,
      session: [{ steps: [{ exercise: 'jumping-jack', goal: MAX }], rounds: 1 }],
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
    defineChallenge({
      name: capitalise(EXERCISES[exercise].name),
      days: 1,
      restartOnMiss: false,
      session: [{ steps: [{ exercise, goal: MAX }], rounds: 1 }],
    }),
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
