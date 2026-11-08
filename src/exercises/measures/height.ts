import { SIDE } from 'superhabit-pose/joints';

import { dot, gravity, length, seen, sub, type Joints } from '@/exercises/body/geometry';
import type { Measure } from './measure';

// shortcut: the thigh only; add a segment when its first exercise is rebuilt on it (high knees).
/** Each segment: the joint on top, the one below it, and the next one down, drawn with them. */
const SEGMENTS = {
  thigh: { ends: ['hip', 'knee', 'ankle'], parts: ['hips'] },
} as const;

export type Segment = keyof typeof SEGMENTS;

/**
 * How far a segment's top joint sits above its bottom one along gravity, in segment lengths:
 * 1 upright, 0 level, below 0 upside down. Null without the phone's gravity.
 */
export function height(segment: Segment): Measure {
  const { ends, parts } = SEGMENTS[segment];
  return {
    parts,
    range: [-1, 1],
    read: (pose, side) => {
      const down = gravity(pose);
      const j = SIDE[side];
      const joints: Joints = [j[ends[0]], j[ends[1]], j[ends[2]]];
      if (!down || !joints.every((i) => seen(pose, i))) return null;
      const along = sub(pose.worldLandmarks[joints[0]], pose.worldLandmarks[joints[1]]);
      const value = -dot(along, down) / length(along);
      return Number.isFinite(value) ? { value, joints } : null;
    },
  };
}
