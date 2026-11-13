// Standing: on your feet, judged on the better-seen leg by the phone's gravity.
import { SIDE } from 'reprepgo-pose/joints';

import {
  bestSide,
  lift,
  rise,
  seen,
  type Joints,
  type Pose,
  type Side,
} from '@/exercises/body/geometry';
import type { Position } from './position';

export type StandingSample = {
  /** How far the ankle–hip line rises from level, in degrees: 90 upright. */
  rise: number;
  /** How far the hip–shoulder line rises from level, in degrees; null with the shoulder unseen. */
  torso: number | null;
  joints: Joints;
  side: Side;
};

// Device clips with gravity: the top of every squat (front-on) rises 79–88°; plank, push-up and
// kneeling clips sit at 8–48° (medians) and pass 60° only while getting up.
const RISE_MIN = 60;
// Upright device lunges facing the phone read the torso at 75–87°: the lean is in the camera's depth.
const TORSO_MIN = 65;

/** Null without the phone's gravity: shape alone can't tell standing from lying with legs straight. */
function measureStanding(pose: Pose): StandingSample | null {
  const side = bestSide(pose, (j) => [j.hip, j.knee, j.ankle]);
  if (!side) return null;
  const { hip: h, knee: k, ankle: a } = SIDE[side];
  const w = pose.worldLandmarks;
  const up = rise(pose, w[a], w[h]);
  // The torso on whichever side shows its shoulder: side-on the far one often hides.
  const shown = [SIDE[side], SIDE[side === 'left' ? 'right' : 'left']].find((j) =>
    seen(pose, j.shoulder),
  );
  const torso = shown ? lift(pose, w[shown.hip], w[shown.shoulder]) : null;
  if (up === null || !Number.isFinite(up)) return null;
  return {
    rise: up,
    torso: torso !== null && Number.isFinite(torso) ? torso : null,
    joints: [h, k, a],
    side,
  };
}

export const standingPosition: Position<StandingSample> = {
  ready: 'Stand tall',
  lost: 'Back on your feet',
  parts: ['head', 'hips', 'feet'],
  read: measureStanding,
  setup: (m) => (m.rise < RISE_MIN ? 'Stand tall' : null),
  form: () => null,
};

/** Standing with the torso kept upright through the movement: a lunge. A squat leans forward by design. */
export const uprightPosition: Position<StandingSample> = {
  ...standingPosition,
  // Unseen shoulders can't show an upright torso either.
  form: (m) => (m.torso === null || m.torso < TORSO_MIN ? 'Keep your torso upright' : null),
};
