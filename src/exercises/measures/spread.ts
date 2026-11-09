import { SIDE } from 'superhabit-pose/joints';

import { distance, dot, gravity, length, reject, seen, sub } from '@/exercises/body/geometry';
import type { Measure } from './measure';

const FAR_VISIBILITY = 0.1;

/**
 * How far apart the feet are across the phone's gravity, in leg lengths (thigh plus shin on the side
 * read, so a bent knee doesn't shrink the unit): 0 together. `forward` along the way the hips face, a
 * lunge's stride; `sideways` along the hips, a jumping jack's legs. Either way a squat's stance is in
 * one and not the other. Null without gravity.
 */
export function spread(way: 'forward' | 'sideways'): Measure {
  return {
    parts: ['feet'],
    range: [0, 3],
    read: (pose, side) => {
      const down = gravity(pose);
      const near = SIDE[side];
      const far = SIDE[side === 'left' ? 'right' : 'left'];
      // The far foot often hides behind the near one, its spot a guess: a low bar, as for plank.
      if (!down || ![near.hip, near.knee, near.ankle].every((i) => seen(pose, i))) return null;
      if (![far.hip, far.ankle].every((i) => seen(pose, i, FAR_VISIBILITY))) return null;
      const w = pose.worldLandmarks;
      const hips = reject(sub(w[far.hip], w[near.hip]), down);
      const feet = reject(sub(w[far.ankle], w[near.ankle]), down);
      const apart =
        way === 'sideways' ? Math.abs(dot(feet, hips)) / length(hips) : length(reject(feet, hips));
      const leg = distance(w[near.hip], w[near.knee]) + distance(w[near.knee], w[near.ankle]);
      const value = apart / leg;
      return Number.isFinite(value) ? { value, joints: [near.ankle, near.hip, far.ankle] } : null;
    },
  };
}
