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
/** A ladder rung: 3n push-ups, 4n sit-ups, then whatever follows (a rest, except on the last rung). */
const rung = (n: number, ...then: Step[]): Challenge['session'][number] => ({
  steps: [
    { exercise: 'pushup', goal: reps(3 * n) },
    { exercise: 'situp', goal: reps(4 * n) },
    ...then,
  ],
  rounds: 1,
});

/** Ours, joined as-is: daily basics first, then circuits. Route id -> challenge, in catalog order. */
const suggested: [string, Challenge][] = [
  ['pushup-fifty', daily('Push-up fifty', 21, 'pushup', reps(50))],
  ['squat-hundred', daily('Squat hundred', 21, 'squat', reps(100))],
  ['plank-minute', daily('Plank minute', 21, 'plank', seconds(60))],
  ['situp-thirty', daily('Sit-up thirty', 21, 'situp', reps(30))],
  // Each leg's lunge counts, so 10 a leg.
  ['lunge-twenty', daily('Lunge twenty', 21, 'lunge', reps(20))],
  ['bridge-thirty', daily('Bridge thirty', 21, 'glute-bridge', reps(30))],
  ['jacks-fifty', daily('Jacks fifty', 14, 'jumping-jack', reps(50))],
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
            { exercise: 'pushup', goal: reps(10) },
            { exercise: 'situp', goal: reps(15) },
            { exercise: 'glute-bridge', goal: reps(15) },
            { exercise: 'plank', goal: seconds(30) },
            rest(60),
          ],
          rounds: 3,
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
            { exercise: 'squat', goal: reps(15) },
            { exercise: 'jumping-jack', goal: reps(20) },
            rest(30),
          ],
          rounds: 5,
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
      // Climbs to 9 push-ups and 12 sit-ups and back down.
      session: [
        rung(1, rest(30)),
        rung(2, rest(30)),
        rung(3, rest(30)),
        rung(2, rest(30)),
        rung(1),
      ],
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
        { steps: [{ exercise: 'pushup', goal: reps(10) }, rest(30)], rounds: 5 },
        { steps: [{ exercise: 'squat', goal: reps(15) }, rest(30)], rounds: 5 },
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
