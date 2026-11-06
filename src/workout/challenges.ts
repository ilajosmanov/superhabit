import { EXERCISES } from '@/exercises/registry';

import { defineChallenge, expand, MAX, reps, seconds, type Challenge } from './plan';

/** Local YYYY-MM-DD; UTC arithmetic keeps calendar days independent of DST. */
export type Day = string;

const DAY_MS = 86_400_000;
const dayNumber = (day: Day) =>
  Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / DAY_MS;

export function challengeDay(
  c: Pick<Challenge, 'days' | 'restartOnMiss'>,
  startedOn: Day,
  done: ReadonlySet<Day>,
  today: Day,
): { day: number; from: Day } | null {
  let from = dayNumber(startedOn);
  const end = dayNumber(today);
  if (end < from) return null;
  for (let d = from; d < end; d += 1) {
    // Check the run's end before a miss: a finished run must never restart.
    if (d - from >= c.days) return null;
    const date = new Date(d * DAY_MS).toISOString().slice(0, 10);
    if (c.restartOnMiss && !done.has(date)) from = d + 1;
  }
  const day = end - from + 1;
  return day > c.days ? null : { day, from: new Date(from * DAY_MS).toISOString().slice(0, 10) };
}

/** Route id -> challenge, in catalog order. Open-ended tests are offered by the camera card. */
const entries: [string, Challenge][] = [
  [
    'squat-pushup',
    {
      name: '3 squats + 3 push-ups',
      days: 30,
      restartOnMiss: false,
      session: [
        {
          steps: [
            { exercise: 'squat', goal: reps(3) },
            { exercise: 'pushup', goal: reps(3) },
          ],
          rounds: 1,
        },
      ],
    },
  ],
  [
    'plank-minute',
    {
      name: 'Plank minute',
      days: 21,
      restartOnMiss: false,
      session: [{ steps: [{ exercise: 'plank', goal: seconds(60) }], rounds: 1 }],
    },
  ],
  [
    'floor-circuit',
    {
      name: 'Floor circuit',
      days: 30,
      restartOnMiss: false,
      session: [
        {
          steps: [
            { exercise: 'pushup', goal: reps(10) },
            { exercise: 'plank', goal: seconds(30) },
            { exercise: 'rest', goal: seconds(30) },
          ],
          rounds: 3,
        },
      ],
    },
  ],
  [
    'two-max-sets',
    {
      name: 'Two max sets',
      days: 14,
      restartOnMiss: false,
      session: [
        {
          steps: [
            { exercise: 'squat', goal: MAX },
            { exercise: 'rest', goal: seconds(60) },
          ],
          rounds: 2,
        },
      ],
    },
  ],
  [
    'squat-hundred',
    {
      name: 'Squat hundred',
      days: 21,
      restartOnMiss: false,
      session: [{ steps: [{ exercise: 'squat', goal: reps(100) }], rounds: 1 }],
    },
  ],
  [
    'pushup-fifty',
    {
      name: 'Push-up fifty',
      days: 21,
      restartOnMiss: false,
      session: [{ steps: [{ exercise: 'pushup', goal: reps(50) }], rounds: 1 }],
    },
  ],
  // Experimental exercises: open-ended, so a miscount never blocks the day.
  [
    'jumping-jack-max',
    {
      name: 'Jumping jacks',
      days: 14,
      restartOnMiss: false,
      session: [{ steps: [{ exercise: 'jumping-jack', goal: MAX }], rounds: 1 }],
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
    'situp-max',
    {
      name: 'Sit-ups',
      days: 14,
      restartOnMiss: false,
      session: [{ steps: [{ exercise: 'situp', goal: MAX }], rounds: 1 }],
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
    'mountain-climber-max',
    {
      name: 'Mountain climbers',
      days: 14,
      restartOnMiss: false,
      session: [{ steps: [{ exercise: 'mountain-climber', goal: MAX }], rounds: 1 }],
    },
  ],
  [
    'squat',
    {
      name: 'Squat test',
      days: 1,
      restartOnMiss: false,
      session: [{ steps: [{ exercise: 'squat', goal: MAX }], rounds: 1 }],
    },
  ],
  [
    'pushup',
    {
      name: 'Push-up test',
      days: 1,
      restartOnMiss: false,
      session: [{ steps: [{ exercise: 'pushup', goal: MAX }], rounds: 1 }],
    },
  ],
];

export const CHALLENGES: ReadonlyMap<string, Challenge> = new Map(
  entries.map(([id, challenge]) => [id, defineChallenge(challenge)]),
);

/** Describe each block once, with its round count; rests do not contribute exercise goals. */
export function summary({ session }: Challenge): string {
  const blocks = new Map<number, { rounds: number; steps: string[] }>();
  for (const { exercise, goal, block, round, rounds } of expand(session)) {
    if (exercise === 'rest' || round !== 1) continue;
    const { name, kind } = EXERCISES[exercise];
    const text =
      goal.type === 'reps'
        ? `${goal.n} ${name}`
        : goal.type === 'seconds'
          ? `${name} ${goal.n} s`
          : `${name}, as ${kind === 'hold' ? 'long' : 'many'} as you can`;
    const group = blocks.get(block) ?? { rounds, steps: [] };
    group.steps.push(text);
    blocks.set(block, group);
  }
  return capitalise(
    [...blocks.values()]
      .map(
        ({ rounds, steps }) => `${rounds > 1 ? `${rounds} rounds: ` : ''}${steps.join(', then ')}`,
      )
      .join(', then '),
  );
}

export const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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
