import { SIDE } from 'superhabit-pose/joints';

import { degrees, dot, gravity, length, seen, sub, type Joints } from '@/exercises/body/geometry';
import type { Measure } from './measure';

/**
 * Each segment: the joint that rises, the one it rises from, and a third drawn with them (the overlay
 * draws them as end, vertex, end). `sign: -1` reads the second over the first.
 */
const SEGMENTS = {
  /** The hip over the knee: a squat's hips. */
  thigh: { ends: ['hip', 'knee', 'ankle'], parts: ['hips'], sign: 1 },
  /** The shoulder over the hip: sitting up. */
  torso: { ends: ['shoulder', 'hip', 'knee'], parts: ['head', 'hips'], sign: 1 },
  /** The hip over the shoulder: lifting the hips off the floor. */
  hips: { ends: ['shoulder', 'hip', 'knee'], parts: ['head', 'hips'], sign: -1 },
} as const;

export type Segment = keyof typeof SEGMENTS;

/**
 * How far a segment rises above level by the phone's gravity, in degrees: 90 upright, 0 level, below
 * 0 when its top joint is the lower. Null without gravity.
 */
export function elevation(segment: Segment): Measure {
  const { ends, parts, sign } = SEGMENTS[segment];
  return {
    parts,
    range: [-90, 90],
    read: (pose, side) => {
      const down = gravity(pose);
      const j = SIDE[side];
      const joints: Joints = [j[ends[0]], j[ends[1]], j[ends[2]]];
      if (!down || !joints.every((i) => seen(pose, i))) return null;
      const along = sub(pose.worldLandmarks[joints[0]], pose.worldLandmarks[joints[1]]);
      const value = degrees(
        Math.asin(Math.min(1, Math.max(-1, (-sign * dot(along, down)) / length(along)))),
      );
      return Number.isFinite(value) ? { value, joints } : null;
    },
  };
}
