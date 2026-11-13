import { SIDE } from 'reprepgo-pose/joints';

import { angle, pictured, seen, STRAIGHT, type Joints } from '@/exercises/body/geometry';
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

/**
 * The angle at a joint, in degrees: 180 = straight. In world space, or as the camera saw it
 * (`'picture'`): right for a limb bending side-on to the lens, where the world guess of the same
 * bend shifts with how the body is turned.
 */
export function jointAngle(bend: Bend, space: 'world' | 'picture' = 'world'): Measure {
  const { ends, parts } = BENDS[bend];
  return {
    parts,
    range: [0, STRAIGHT],
    read: (pose, side) => {
      const j = SIDE[side];
      const joints: Joints = [j[ends[0]], j[ends[1]], j[ends[2]]];
      if (!joints.every((i) => seen(pose, i))) return null;
      const [a, b, c] = joints.map((i) =>
        space === 'picture' ? pictured(pose, i) : pose.worldLandmarks[i],
      );
      const value = a && b && c ? angle(a, b, c) : NaN;
      return Number.isFinite(value) ? { value, joints } : null;
    },
  };
}
