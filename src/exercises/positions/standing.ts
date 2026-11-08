// Standing: on your feet, judged on the better-seen leg by the phone's gravity.
import { SIDE } from 'superhabit-pose/joints';

import { bestSide, rise, type Joints, type Pose, type Side } from '@/exercises/body/geometry';
import type { Position } from './position';

export type StandingSample = {
  /** How far the ankle–hip line rises from level, in degrees: 90 upright. */
  rise: number;
  joints: Joints;
  side: Side;
};

// Device clips with gravity: the top of every squat (front-on) rises 79–88°; plank, push-up and
// kneeling clips sit at 8–48° (medians) and pass 60° only while getting up.
const RISE_MIN = 60;

/** Null without the phone's gravity: shape alone can't tell standing from lying with legs straight. */
function measureStanding(pose: Pose): StandingSample | null {
  const side = bestSide(pose, (j) => [j.hip, j.knee, j.ankle]);
  if (!side) return null;
  const { hip: h, knee: k, ankle: a } = SIDE[side];
  const up = rise(pose, pose.worldLandmarks[a], pose.worldLandmarks[h]);
  return up !== null && Number.isFinite(up) ? { rise: up, joints: [h, k, a], side } : null;
}

export const standingPosition: Position<StandingSample> = {
  ready: 'Stand tall',
  lost: 'Back on your feet',
  parts: ['head', 'hips', 'feet'],
  read: measureStanding,
  setup: (m) => (m.rise < RISE_MIN ? 'Stand tall' : null),
  form: () => null,
};
