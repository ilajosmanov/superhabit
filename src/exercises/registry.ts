import { initialPushup, measurePushup, stepPushup, type PushupState } from './pushup';
import type { Pose } from './geometry';
import type { Phase } from './rep-counter';
import { initialSquat, measure, stepSquat, type SquatState } from './squat';

// The exercise input: one frame's joints. Other folders import it from here, not from geometry.
export type { Pose };

/** What the session and screen read from any counter. SquatState and PushupState both satisfy it. */
// shortcut: public phases assume an up/down rep cycle; revisit this contract for timed holds or alternating sides.
export type Tally = {
  reps: number;
  noReps: number;
  phase: Phase;
  lastRep: { cues: string[] } | null;
};

/** The single list of exercises: one counter state type per id. Add a key here to add an exercise. */
export type Counters = { squat: SquatState; pushup: PushupState };
export type ExerciseId = keyof Counters;

export type Exercise<S extends Tally> = {
  /** Plural, lower case, for speech and labels: 'squats'. */
  name: string;
  /** Line icon: an SVG path on a 32×32 grid, stroked 1.5. */
  glyph: string;
  /** The UI is locked to this while the exercise's set runs. */
  orientation: 'portrait' | 'landscape';
  /** How to place the phone, as a heading and a spoken sentence. */
  place: string;
  steps: readonly string[];
  /** When counting starts (the counter waits for the start position). */
  hint: string;
  initial: S;
  /** measure + step for one detector result. Pure: returns the next state, never mutates `s`. */
  step(s: S, pose: Pose, nowMs: number): S;
  /** Metrics line for the last rep, without cues; null before the first rep. */
  stats(s: S): string | null;
};

const fmtMs = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);

// Mapped type so `EXERCISES[id].step(counters[id], …)` type-checks for a generic id.
// A missing entry for a Counters key is a compile error.
// shortcut: counter wiring, setup copy, icons and formatting share this registry. As the catalog grows,
// colocate definitions with each exercise and separate presentation metadata from the counter contract.
export const EXERCISES: { [K in ExerciseId]: Exercise<Counters[K]> } = {
  squat: {
    name: 'squats',
    glyph:
      'M13.4 6a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M15 9l-3 8M12 17l9 1M21 18l-1 8M14 11.5l10 .5M6 26h20',
    orientation: 'portrait',
    place: 'Stand the phone upright',
    steps: ['Prop it up on its short edge', '2 to 3 m away, facing you', 'Head to feet in frame'],
    hint: 'Counting starts once you stand tall.',
    initial: initialSquat,
    step: (s, pose, t) => stepSquat(s, measure(pose), t),
    stats: ({ lastRep: r }) =>
      r &&
      `${Math.round(r.depth)}° · SYM ${Math.round(r.symmetry)}° · ${fmtMs(r.downMs)}↓ ${fmtMs(r.upMs)}↑ · LEAN ${Math.round(r.lean)}°`,
  },
  pushup: {
    name: 'push-ups',
    glyph: 'M23.4 12a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M23 15L5 22M21 15.8l.6 9.2M3 26h26',
    orientation: 'landscape',
    place: 'Turn the phone sideways',
    steps: [
      'Lay it on the floor on its long edge',
      'About 2 m away, side-on to you',
      'Head to feet in frame',
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
