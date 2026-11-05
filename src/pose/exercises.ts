import { initialPushup, measurePushup, stepPushup, type PushupState } from './pushup';
import type { Pose } from './geometry';
import { initialSquat, measure, stepSquat, type SquatState } from './squat';

/** What the session and screen read from any counter. SquatState and PushupState both satisfy it. */
export type Tally = {
  reps: number;
  noReps: number;
  phase: 'waiting' | 'up' | 'down';
  lastRep: { cues: string[] } | null;
};

/** The single list of exercises: one counter state type per id. Add a key here to add an exercise. */
export type Counters = { squat: SquatState; pushup: PushupState };
export type ExerciseId = keyof Counters;

export type Exercise<S extends Tally> = {
  /** Plural, lower case, for speech and labels: 'squats'. */
  name: string;
  /** The UI is locked to this while the exercise's set runs. */
  orientation: 'portrait' | 'landscape';
  /** How to place the phone, as a heading and a spoken sentence. */
  place: string;
  steps: readonly string[];
  /** When counting starts (the counter waits for the start position). */
  hint: string;
  initial: S;
  /** measure + step for one detector result. Called exactly once per result (stateful filter in S). */
  step(s: S, pose: Pose, nowMs: number): S;
  /** Metrics line for the last rep, without cues; null before the first rep. */
  stats(s: S): string | null;
};

export const fmtMs = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);

// Mapped type so `EXERCISES[id].step(counters[id], …)` type-checks for a generic id.
// A missing entry for a Counters key is a compile error.
export const EXERCISES: { [K in ExerciseId]: Exercise<Counters[K]> } = {
  squat: {
    name: 'squats',
    orientation: 'portrait',
    place: 'Stand the phone upright',
    steps: [
      'Prop it up on its short edge',
      '2 to 3 m away, facing you',
      'Head to feet in frame, then tap Continue',
    ],
    hint: 'Counting starts once you stand tall.',
    initial: initialSquat,
    step: (s, pose, t) => stepSquat(s, measure(pose), t),
    stats: ({ lastRep: r }) =>
      r &&
      `${Math.round(r.depth)}° · SYM ${Math.round(r.symmetry)}° · ${fmtMs(r.downMs)}↓ ${fmtMs(r.upMs)}↑ · LEAN ${Math.round(r.lean)}°`,
  },
  pushup: {
    name: 'push-ups',
    orientation: 'landscape',
    place: 'Turn the phone sideways',
    steps: [
      'Lay it on the floor on its long edge',
      'About 2 m away, side-on to you',
      'Head to feet in frame, then tap Continue',
    ],
    hint: 'Counting starts once you hold a plank.',
    initial: initialPushup,
    step: (s, pose, t) => stepPushup(s, measurePushup(pose), t),
    stats: ({ lastRep: r }) =>
      r &&
      `${Math.round(r.depth)}° · BODY ${Math.round(r.body)}° · ${fmtMs(r.downMs)}↓ ${fmtMs(r.upMs)}↑`,
  },
};

/** Fresh counters for every exercise; typed against Counters so a new key cannot be forgotten. */
export const initialCounters: Counters = {
  squat: EXERCISES.squat.initial,
  pushup: EXERCISES.pushup.initial,
};

/** One set: count `reps` of `exercise`. `reps: Infinity` = open-ended. */
export type Target = { exercise: ExerciseId; reps: number };
/** Non-empty by type, so "current set" always exists. */
export type Challenge = { name: string; sets: readonly [Target, ...Target[]] };

export const squatTest: Challenge = {
  name: 'Squat test',
  sets: [{ exercise: 'squat', reps: Infinity }],
};

/** Route id -> challenge. A Map so a route param lookup is `get(id)` -> Challenge | undefined. */
export const CHALLENGES: ReadonlyMap<string, Challenge> = new Map([
  ['squat', squatTest],
  ['pushup', { name: 'Push-up test', sets: [{ exercise: 'pushup', reps: Infinity }] }],
  [
    'squat-pushup',
    {
      name: '3 squats + 3 push-ups',
      sets: [
        { exercise: 'squat', reps: 3 },
        { exercise: 'pushup', reps: 3 },
      ],
    },
  ],
]);
