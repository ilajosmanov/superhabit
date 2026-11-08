import { SIDE } from 'superhabit-pose/joints';

import { fmtMs, SETUP, type Exercise } from './exercise';
import {
  angle,
  bestSide,
  distance,
  sub,
  tilt,
  type Joints,
  type Pose,
} from '@/exercises/body/geometry';
import { hold, type HoldState } from '@/exercises/kinds/hold';

/** Angles on the better-seen side, in degrees. */
export type WallSitSample = {
  knee: number;
  /** Torso to thigh. */
  hip: number;
  /** Torso from vertical. */
  lean: number;
  /** Hip height above the ankle, in shin lengths: about 1 at the wall, 0 sitting on the floor. */
  seat: number;
  joints: Joints;
};

// Thighs level and back upright reads 90° at knee and hip; allow 25° either way.
const KNEE_MIN = 65;
const KNEE_MAX = 115;
const HIP_MIN = 65;
const HIP_MAX = 120;
const LEAN_MAX = 25;
const SEAT_MIN = 0.6;
// shortcut: textbook angles, no traces yet; the wall can't be seen, so a held squat or a chair also
// pass (one squat clip holds 12 s), and so does a held lunge (up to 8 s on device lunge clips).
// Tune on device sets before relying on it.
// World y is taken as down for the seat and the lean, as squat's lean does.

export function measureWallSit(pose: Pose): WallSitSample | null {
  const side = bestSide(pose, (j) => [j.shoulder, j.hip, j.knee, j.ankle]);
  if (!side) return null;
  const { shoulder: s, hip: h, knee: k, ankle: a } = SIDE[side];
  const w = pose.worldLandmarks;
  const shape = {
    knee: angle(w[h], w[k], w[a]),
    hip: angle(w[s], w[h], w[k]),
    lean: tilt(sub(w[h], w[s])),
    seat: (w[a].y - w[h].y) / distance(w[k], w[a]),
  };
  const joints: Joints = [h, k, a];
  return Object.values(shape).every(Number.isFinite) ? { ...shape, joints } : null;
}

const wallSitHold = hold<WallSitSample>({
  // shortcut: every cue counts as leaving the position until this exercise is rebuilt on a position.
  form: () => null,
  setup: (m) => {
    if (m.seat < SEAT_MIN) return 'Sit back against the wall';
    if (m.knee > KNEE_MAX || m.hip > HIP_MAX) return 'Slide down until your thighs are level';
    // Before the low check: leaning forward also closes the hip.
    if (m.lean > LEAN_MAX) return 'Keep your back on the wall';
    if (m.knee < KNEE_MIN || m.hip < HIP_MIN) return 'Come up until your thighs are level';
    return null;
  },
  lost: 'Back into your wall sit',
});

export const wallSit: Exercise<HoldState, WallSitSample> = {
  ...wallSitHold,
  name: 'wall sit',
  placement: 'side-upright',
  ...SETUP['side-upright'],
  hint: 'The clock starts once your thighs are level and your back is on the wall.',
  ready: 'Sit back against the wall',
  parts: ['head', 'hips', 'feet'],
  gauge: null,
  measure: measureWallSit,
  stats: ({ heldMs, noReps }) =>
    `HELD ${fmtMs(heldMs)} · ${noReps} ${noReps === 1 ? 'BREAK' : 'BREAKS'}`,
};
