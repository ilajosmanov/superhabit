// The plank position: forearm or high, judged side-on from the better-seen side, by the phone's gravity.
import { SIDE } from 'reprepgo-pose/joints';

import {
  angle,
  bestSide,
  dot,
  gravity,
  length,
  pictured,
  reject,
  rise,
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
  /**
   * How far the knee sits below its hip–ankle line in the picture, as a share of that line: near 0
   * with the leg straight on its toes, more with the knee bent. The more bent knee of the two.
   */
  knee: number;
  /** The lower knee's height, as the hips'. */
  kneeHeight: number;
  /**
   * The same for the hip and the shoulder–ankle line: a sag; negative, a pike.
   */
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
// place is a guess; down on the floor it shows, 0.63–0.92.
const FAR_KNEE_VISIBILITY = 0.6;
const REACH_MIN = 40;
const REACH_MAX = 155;
// Device clips with gravity, checked against their video (front camera, phone leaning on its long
// edge): hips 1.03+ above the wrists in a plank or kneeling, under 0.72 in a sag, on a side or lying;
// a plank's shoulder–ankle line rises 3–26°, standing 47–81°. Hip height is judged at rest only: a
// push-up's bottom brings the hips to 0.2.
// The hip off the body line, in the picture: −0.06–0.05 in a plank, 0.14–0.24 in a sag, 0.03–0.06
// in a slight sag, kneeling or lying, −0.10 and below in a pike that shows on the skeleton.
// The knee off the leg's line, in the picture: 0.03–0.12 on the toes, 0.12–0.16 on the toes in a
// sag, 0.18–0.67 with that knee on the floor (0.15 by geometry with the shins flat), and up to 0.30
// in the air through a burpee's kick-back. Its height above the wrists: 0.45+ on the toes, under
// 0.15 on the knees, but under long shorts the world guess put a straight leg's knee as low as 0.24.
// Neither tells kneeling alone, so a knee is down when both say so.
const RISE_MAX = 45;
const HIP_MIN = 0.85;
const KNEE_MAX = 0.13;
const KNEE_HEIGHT_MIN = 0.3;
const SAG_MAX = 0.08;
const PIKE_MAX = 0.08;
// A bend in the picture grows as the body turns to the lens, 1.4 times at 45°: past that a good
// plank would read as bent, so nothing is read. The turn is the detector's world guess of the body
// line; the skeletons it guesses through a burpee's kick-back are turned further too.
// shortcut: no clip is turned past 30°, so 45 is from projection geometry; record one and re-tune.
const TURN_MAX = 45;

/**
 * Null without the phone's gravity (shape alone can't tell a plank from standing or lying), without
 * the frame's size, or with the body turned too far from side-on.
 */
export function measurePlank(pose: Pose): PlankSample | null {
  const down = gravity(pose);
  if (!down) return null;
  const side = bestSide(pose, (j) => Object.values(j), MIN_VISIBILITY);
  if (!side) return null;
  const { shoulder: s, elbow: e, wrist: w, hip: h, knee: k, ankle: a } = SIDE[side];
  const far = SIDE[side === 'left' ? 'right' : 'left'];
  const world = pose.worldLandmarks;
  const forearm = length(sub(world[e], world[w]));
  const height = (i: number) => -dot(sub(world[i], world[w]), down) / forearm;
  // How far `mid` sits below the line between `from` and `to` in the picture, as a share of that
  // line. Gravity only says which way is below: its picture components point down the frame.
  const below = (from: number, mid: number, to: number) => {
    const [p, q, r] = [from, mid, to].map((i) => pictured(pose, i));
    if (!p || !q || !r) return NaN;
    const line = sub(p, r);
    const off = reject(sub(q, r), line);
    return (Math.sign(dot(off, { ...down, z: 0 })) * length(off)) / length(line);
  };
  const body = sub(world[s], world[a]);
  if (Math.abs(body.z) > length(body) * Math.sin((TURN_MAX * Math.PI) / 180)) return null;
  // The far leg's bend needs its hip and ankle too; unseen, their places are guesses.
  const farKnee =
    seen(pose, far.knee, FAR_KNEE_VISIBILITY) &&
    seen(pose, far.hip, MIN_VISIBILITY) &&
    seen(pose, far.ankle, MIN_VISIBILITY) &&
    Number.isFinite(below(far.hip, far.knee, far.ankle));
  const sample = {
    reach: angle(world[h], world[s], world[w]),
    hip: height(h),
    // Either knee: one down is kneeling, whichever side.
    knee: Math.max(below(h, k, a), farKnee ? below(far.hip, far.knee, far.ankle) : -Infinity),
    kneeHeight: Math.min(height(k), farKnee ? height(far.knee) : Infinity),
    drop: below(s, h, a),
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
    return m.knee > KNEE_MAX && m.kneeHeight < KNEE_HEIGHT_MIN ? 'Knees off the floor' : null;
  },
  form: (m) => (m.drop > SAG_MAX || m.drop < -PIKE_MAX ? 'Keep your body straight' : null),
};
