import { SIDE } from 'superhabit-pose/joints';

import { exercise, SETUP } from './exercise';
import {
  angle,
  dot,
  length,
  mid,
  reject,
  seen,
  sub,
  tilt,
  type Joints,
  type Pose,
  type Vec,
} from '@/exercises/body/geometry';
import { hold } from '@/exercises/kinds/hold';
import type { Position } from '@/exercises/positions/position';

/** Shape of a side plank seen from the front, in degrees and shoulder heights. */
export type SidePlankSample = {
  /** Lower hip–shoulder–elbow: the support arm under the shoulder. */
  reach: number;
  /** Body line from vertical: about 90 lying, 0 standing. */
  lying: number;
  /**
   * Shoulder spread in the image, in image torso lengths: about 0.7 or more stacked facing the camera,
   * near 0 when one hides behind the other (a plank seen side-on).
   */
  stack: number;
  knees: number;
  body: number;
  /** Hip clearance above the ankle–elbow support line, in shoulder heights. */
  hips: number;
  joints: Joints;
};

// Facing the camera both sides show, but the lower limbs sit behind the floor line: plank's low bar.
const MIN_VISIBILITY = 0.1;
const REACH_MIN = 40;
const REACH_MAX = 155;
const LYING_MIN = 50;
const STACK_MIN = 0.35;
const KNEES_MIN = 150;
const BODY_MIN = 150;
// Straight, the hips sit about halfway up; lying on your side, propped on an elbow, reads about 0.2.
const HIPS_MIN = 0.4;
// shortcut: thresholds from drawn poses, no side plank traces yet; tune on device sets. Either side
// counts, so a two-sided session is two steps. World y is taken as down for `lying` and the lower side.

// Frame coordinates stretch with the aspect ratio; fine for a ratio this far from its threshold.
const span = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

export function measureSidePlank(pose: Pose): SidePlankSample | null {
  const { left, right } = SIDE;
  const core = [left, right].flatMap((j) => [j.shoulder, j.hip, j.knee, j.ankle]);
  if (!core.every((i) => seen(pose, i, MIN_VISIBILITY))) return null;
  const w = pose.worldLandmarks;
  const image = pose.landmarks;
  // y is down: the lower shoulder is the one the body rests on.
  const [low, high] = w[left.shoulder].y > w[right.shoulder].y ? [left, right] : [right, left];
  if (!seen(pose, low.elbow, MIN_VISIBILITY)) return null;
  const shoulder = mid(w[low.shoulder], w[high.shoulder]);
  const hip = mid(w[low.hip], w[high.hip]);
  const knee = mid(w[low.knee], w[high.knee]);
  const ankle = mid(w[low.ankle], w[high.ankle]);
  // As in plank, up is the shoulders' offset from the support line, so a tilted phone doesn't matter.
  // The elbow, not the wrist: it sits under the shoulder, while the forearm may point anywhere.
  const up = reject(sub(shoulder, ankle), sub(w[low.elbow], ankle));
  const shape = {
    reach: angle(w[low.hip], w[low.shoulder], w[low.elbow]),
    lying: tilt(sub(ankle, shoulder)),
    // In the image: world depth is too rough to see a shoulder behind the other.
    stack:
      span(image[high.shoulder], image[low.shoulder]) /
      span(mid(image[high.shoulder], image[low.shoulder]), mid(image[high.hip], image[low.hip])),
    knees: angle(hip, knee, ankle),
    body: angle(shoulder, hip, ankle),
    hips: dot(sub(hip, ankle), up) / length(up) ** 2,
  };
  const joints: Joints = [low.shoulder, low.hip, low.ankle];
  return Object.values(shape).every(Number.isFinite) ? { ...shape, joints } : null;
}

// shortcut: a position inside its exercise until a second exercise needs it; move to positions/.
const sidePlankPosition: Position<SidePlankSample> = {
  ready: 'Lie on your side, on one forearm',
  lost: 'Back into your side plank',
  parts: ['head', 'hips', 'feet'],
  read: measureSidePlank,
  // shortcut: every cue counts as leaving the position until this exercise is rebuilt on a position.
  form: () => null,
  setup: (m) => {
    if (m.lying < LYING_MIN) return 'Lie on your side, on one forearm';
    if (m.stack < STACK_MIN) return 'Turn onto your side, facing the phone';
    if (m.reach < REACH_MIN || m.reach > REACH_MAX) return 'Prop up on your forearm';
    if (m.knees < KNEES_MIN) return 'Straighten your legs';
    if (m.body < BODY_MIN || m.hips < HIPS_MIN) return 'Lift your hips';
    return null;
  },
};

export const sidePlank = exercise(hold(sidePlankPosition), {
  name: 'side plank',
  // The floor spot, but you face the phone: the body line runs across the frame.
  placement: 'side-floor',
  place: SETUP['side-floor'].place,
  steps: [
    'Lay it on the floor on its long edge',
    'About 2 m away, in front of you',
    'Head to feet in frame',
  ],
  hint: 'Face the phone. The clock starts once your hips lift into a straight line.',
  how: ['Lift your hips into a straight line', 'The clock runs while you hold it'],
});
