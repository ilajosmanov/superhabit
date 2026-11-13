import { SIDE } from 'reprepgo-pose/joints';

import { angle, seen, STRAIGHT, type Joints } from '@/exercises/body/geometry';
import type { Measure } from './measure';

/** Each joint that bends, between its two neighbours, and the body parts those sit in. */
const BENDS = {
  elbow: { ends: ['shoulder', 'elbow', 'wrist'], parts: ['head', 'hands'] },
  knee: { ends: ['hip', 'knee', 'ankle'], parts: ['hips', 'feet'] },
  hip: { ends: ['shoulder', 'hip', 'knee'], parts: ['head', 'hips'] },
  /** The arm raised from the side: about 20 hanging, 180 straight overhead. */
  shoulder: { ends: ['hip', 'shoulder', 'elbow'], parts: ['head', 'hands', 'hips'] },
} as const;

export type Bend = keyof typeof BENDS;

/** The angle at a joint, in degrees, in world space: 180 = straight. */
export function jointAngle(bend: Bend): Measure {
  const { ends, parts } = BENDS[bend];
  return {
    parts,
    range: [0, STRAIGHT],
    read: (pose, side) => {
      const j = SIDE[side];
      const joints: Joints = [j[ends[0]], j[ends[1]], j[ends[2]]];
      if (!joints.every((i) => seen(pose, i))) return null;
      const [a, b, c] = joints.map((i) => pose.worldLandmarks[i]);
      const value = angle(a, b, c);
      return Number.isFinite(value) ? { value, joints } : null;
    },
  };
}
