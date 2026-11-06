import type { BodyPart, Joints, Pose } from './geometry';
import {
  initialPushup,
  measurePushup,
  PUSHUP_DOWN,
  PUSHUP_UP,
  stepPushup,
  type PushupSample,
  type PushupState,
} from './pushup';
import type { Phase } from './rep-counter';
import type { Smooth } from './smooth';
import { DOWN, initialSquat, measure, stepSquat, UP, type Sample, type SquatState } from './squat';

// The exercise input: one frame's joints. Other folders import these from here, not from geometry.
export type { BodyPart, Phase, Pose };
export { outOfFrame } from './geometry';

/** What the session and screen read from any counter. SquatState and PushupState both satisfy it. */
// shortcut: public phases assume an up/down rep cycle; revisit this contract for timed holds or alternating sides.
export type Tally = {
  reps: number;
  noReps: number;
  phase: Phase;
  /** Lowest held angle since the last top; 180 = none yet. */
  min: number;
  /** The smoothed measured angle; unset until the first sample and after losing tracking. */
  filter?: Smooth;
  /** `upMs`: from the rep's bottom to the top that ended it; null if unknown. */
  lastRep: { counted: boolean; depth: number; upMs: number | null; cues: string[] } | null;
};

/** What any measure reports besides its angles: the joints of the angle it counts on. */
type Measured = { joints: Joints };

/** The single list of exercises: one counter state and sample type per id. Add a key to both to add an exercise. */
export type Counters = { squat: SquatState; pushup: PushupState };
type Samples = { squat: Sample; pushup: PushupSample };
export type ExerciseId = keyof Counters & keyof Samples;

export type Exercise<S extends Tally, M extends Measured = Measured> = {
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
  /** The start position, as a short heading while the counter waits for it. */
  ready: string;
  /** Must be in frame to start; the rest may be cut off. */
  parts: readonly BodyPart[];
  /** Thresholds of the measured angle, deg: at or below `down` is deep enough, at or above `up` is the top. */
  gauge: { down: number; up: number };
  initial: S;
  /** One detector result's sample; null unless the needed joints are seen. Pure. */
  measure(pose: Pose): M | null;
  /** Pure: returns the next state, never mutates `s`. */
  step(s: S, sample: M | null, nowMs: number): S;
  /** Metrics line for the last rep, without cues; null before the first rep. */
  stats(s: S): string | null;
};

const fmtMs = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);

// Mapped type so `EXERCISES[id].step(counters[id], …)` type-checks for a generic id.
// A missing entry for a Counters key is a compile error.
// shortcut: counter wiring, setup copy, icons and formatting share this registry. As the catalog grows,
// colocate definitions with each exercise and separate presentation metadata from the counter contract.
export const EXERCISES: { [K in ExerciseId]: Exercise<Counters[K], Samples[K]> } = {
  squat: {
    name: 'squats',
    glyph:
      'M13.4 6a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M15 9l-3 8M12 17l9 1M21 18l-1 8M14 11.5l10 .5M6 26h20',
    orientation: 'portrait',
    place: 'Stand the phone upright',
    steps: ['Prop it up on its short edge', '2 to 3 m away, facing you', 'Head to feet in frame'],
    hint: 'Counting starts once you stand tall.',
    ready: 'Stand tall',
    parts: ['head', 'hips', 'feet'],
    gauge: { down: DOWN, up: UP },
    initial: initialSquat,
    measure,
    step: stepSquat,
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
    ready: 'Get into a plank',
    // Feet too: counting falls back to the knees, but the body line reads best heel to shoulder.
    parts: ['head', 'hands', 'hips', 'feet'],
    gauge: { down: PUSHUP_DOWN, up: PUSHUP_UP },
    initial: initialPushup,
    measure: measurePushup,
    step: stepPushup,
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
