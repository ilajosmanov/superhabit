// Seated in the air (a wall sit), judged side-on from the better-seen side by the phone's gravity.
import { SIDE } from 'superhabit-pose/joints';

import {
  bestSide,
  distance,
  dot,
  gravity,
  lift,
  seen,
  sub,
  type Joints,
  type Pose,
  type Side,
} from '@/exercises/body/geometry';
import type { Position } from './position';

/** How far each segment rises over level, in degrees: 90 upright, 0 level, below 0 its top the lower. */
export type SeatedSample = {
  /** The hip over the knee: 0 with the thighs level. */
  thigh: number;
  /** The knee over the ankle: 90 with the shins upright. */
  shin: number;
  /** The shoulder over the hip: 90 with the back upright. */
  torso: number;
  /** How far apart the knees sit by height, in thigh lengths: 0 side by side; null with the far knee unseen. */
  knees: number | null;
  joints: Joints;
  side: Side;
};

// Device wall sits with gravity (front camera on a diagonal, back camera side-on), checked against their
// video. The wall can't be seen: an upright back over level thighs and upright shins can't balance without it,
// so a squat held leaning forward fails. A chair passes, and so do a squat held with the shins and back
// within 25° of upright, a wide horse stance, and a lunge held at the bottom with the far knee hidden. shortcut: no clip yet of a squat held off the wall, a held
// lunge or a chair; record them before trusting those refusals.
// Upright shins read 62–88°, the back camera's side view the lowest; crouching low against the wall 33–50°.
const SHIN_MIN = 65;
// Standing upright reads the back at 76–84° on device squat clips: leave room for noise.
const UPRIGHT_MIN = 65;
// Level thighs read 9–29° over level (the model's hip sits over the thigh bone), half standing 40–60°,
// standing against the wall 60–72°, sunk to the floor −50°.
/** Thighs past this from level are out of the position: half standing, or sitting down. */
const OUT = 50;
/** Thighs past this from level pause the clock. */
const LEVEL = 35;
/** A lunge's back knee sits about a thigh length under the front one. */
const KNEES_MAX = 0.4;

/** Null without the phone's gravity. */
function measureSeated(pose: Pose): SeatedSample | null {
  const down = gravity(pose);
  const side = bestSide(pose, (j) => [j.shoulder, j.hip, j.knee, j.ankle]);
  if (!down || !side) return null;
  const { shoulder: s, hip: h, knee: k, ankle: a } = SIDE[side];
  const far = SIDE[side === 'left' ? 'right' : 'left'].knee;
  const w = pose.worldLandmarks;
  const up = (from: number, to: number) => lift(pose, w[from], w[to]) ?? NaN;
  const shape = { thigh: up(k, h), shin: up(a, k), torso: up(h, s) };
  if (!Object.values(shape).every(Number.isFinite)) return null;
  const knees = Math.abs(dot(sub(w[far], w[k]), down)) / distance(w[h], w[k]);
  const sample = { ...shape, knees: seen(pose, far) && Number.isFinite(knees) ? knees : null };
  return { ...sample, joints: [h, k, a], side };
}

/** Thighs level, shins and back upright: what the clock times. Leaving the wall breaks the hold. */
export const inTheAirPosition: Position<SeatedSample> = {
  ready: 'Sit back against the wall',
  lost: 'Back into your wall sit',
  parts: ['head', 'hips', 'feet'],
  read: measureSeated,
  setup: (m) => {
    if (m.shin < SHIN_MIN) return 'Sit back against the wall';
    if (m.thigh > OUT) return 'Slide down until your thighs are level';
    if (m.thigh < -OUT) return 'Come up until your thighs are level';
    if (m.knees !== null && m.knees > KNEES_MAX) return 'Feet side by side';
    return m.torso < UPRIGHT_MIN ? 'Keep your back on the wall' : null;
  },
  form: (m) =>
    m.thigh > LEVEL
      ? 'Slide down until your thighs are level'
      : m.thigh < -LEVEL
        ? 'Come up until your thighs are level'
        : null,
};
