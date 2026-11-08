// The plank position: forearm or high, judged side-on from the better-seen side, by the phone's gravity.
import { SIDE } from 'superhabit-pose/joints';

import {
  add,
  angle,
  bestSide,
  dot,
  gravity,
  length,
  rise,
  scale,
  seen,
  sub,
  type Joints,
  type Pose,
  type Side,
} from '@/exercises/body/geometry';
import type { Position } from './position';

/**
 * One frame on the better-seen side. Heights are along gravity, in forearm lengths, above the wrists,
 * which rest on the floor in either plank.
 */
export type PlankSample = {
  /** Hip–shoulder–wrist: the arm under the shoulder. */
  reach: number;
  hip: number;
  knee: number;
  /** How far the hip sits below the shoulder–ankle line: a sag; negative, a pike. */
  drop: number;
  /** How far the shoulder–ankle line rises from level, in degrees. */
  rise: number;
  joints: Joints;
  /** The side measured, so a movement can be read on the same side. */
  side: Side;
};

// Occluded knees and wrists side-on need a low bar; forearm reach extends to 155°.
const MIN_VISIBILITY = 0.1;
// The far knee counts only when seen this well: hidden behind the body it reads 0.25–0.5 and its
// height is a guess; down on the floor it shows, 0.63–0.92.
const FAR_KNEE_VISIBILITY = 0.6;
const REACH_MIN = 40;
const REACH_MAX = 155;
// Device clips with gravity, checked against their video (front camera, phone leaning on its long
// edge): hips 1.03+ above the wrists in a plank or kneeling, under 0.72 in a sag, on a side or lying;
// hip drop below the body line −0.41–0.14 in a plank or a push-up (its bottom too), 0.79+ in a sag,
// 0.17–0.32 lying or on a side, −0.79 and below in a pike; knees 0.45+ on the toes, under 0.15 on
// the knees. A plank's shoulder–ankle line rises 3–26°, standing 47–81°. Hip height is judged at rest
// only: a push-up's bottom brings the hips to 0.2.
const RISE_MAX = 45;
const HIP_MIN = 0.85;
const KNEE_MIN = 0.3;
const SAG_MAX = 0.4;
const PIKE_MAX = 0.6;

/** Null without the phone's gravity: shape alone can't tell a plank from standing or lying. */
export function measurePlank(pose: Pose): PlankSample | null {
  const down = gravity(pose);
  if (!down) return null;
  const side = bestSide(pose, (j) => Object.values(j), MIN_VISIBILITY);
  if (!side) return null;
  const { shoulder: s, elbow: e, wrist: w, hip: h, knee: k, ankle: a } = SIDE[side];
  const far = SIDE[side === 'left' ? 'right' : 'left'].knee;
  const world = pose.worldLandmarks;
  const forearm = length(sub(world[e], world[w]));
  const height = (i: number) => -dot(sub(world[i], world[w]), down) / forearm;
  // The point on the shoulder–ankle line level with the hip along it.
  const body = sub(world[s], world[a]);
  const onLine = add(world[a], scale(body, dot(sub(world[h], world[a]), body) / dot(body, body)));
  const sample = {
    reach: angle(world[h], world[s], world[w]),
    hip: height(h),
    // The lower knee: one down is kneeling, whichever side.
    knee: seen(pose, far, FAR_KNEE_VISIBILITY) ? Math.min(height(k), height(far)) : height(k),
    drop: dot(sub(world[h], onLine), down) / forearm,
    rise: rise(pose, world[a], world[s]) ?? NaN,
  };
  if (!Object.values(sample).every(Number.isFinite)) return null;
  return { ...sample, joints: [s, h, a], side };
}

export const plankPosition: Position<PlankSample> = {
  ready: 'Get into a plank',
  lost: 'Back into your plank',
  parts: ['head', 'hands', 'hips', 'feet'],
  read: measurePlank,
  setup: (m) => {
    if (m.reach < REACH_MIN || m.reach > REACH_MAX) return 'Get into a plank';
    if (m.rise > RISE_MAX) return 'Get down into a plank';
    // Hips down with the body straight is lying (flat, on the forearms or a side); bent at the hips
    // it is a sag, which form judges.
    if (m.hip < HIP_MIN) return m.drop < SAG_MAX ? 'Get into a plank' : null;
    // Knees down with the hips up is kneeling, another position.
    return m.knee < KNEE_MIN ? 'Knees off the floor' : null;
  },
  form: (m) => (m.drop > SAG_MAX || m.drop < -PIKE_MAX ? 'Keep your body straight' : null),
};
