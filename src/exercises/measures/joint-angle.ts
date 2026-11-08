import { SIDE } from 'superhabit-pose/joints';

import { angle, seen, type Joints, type Side } from '@/exercises/body/geometry';
import type { Measure } from './measure';

// shortcut: elbow and knee only; add the hip (shoulder–hip–knee) when sit-up is rebuilt on it.
/** Each joint that bends, between its two neighbours. */
const ENDS = {
  elbow: ['shoulder', 'elbow', 'wrist'],
  knee: ['hip', 'knee', 'ankle'],
} as const;

export type Bend = keyof typeof ENDS;

/** The angle at a joint, in degrees, in world space: 180 = straight. */
export function jointAngle(bend: Bend): Measure {
  const joints = (side: Side): Joints => {
    const [a, b, c] = ENDS[bend];
    const j = SIDE[side];
    return [j[a], j[b], j[c]];
  };
  return {
    joints,
    read: (pose, side) => {
      const at = joints(side);
      if (!at.every((i) => seen(pose, i))) return null;
      const [a, b, c] = at.map((i) => pose.worldLandmarks[i]);
      const value = angle(a, b, c);
      return Number.isFinite(value) ? { value, joints: at } : null;
    },
  };
}
