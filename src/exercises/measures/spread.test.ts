import { describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { body } from '@/exercises/__fixtures__/body';
import { spread } from './spread';

const forward = spread('forward');
const sideways = spread('sideways');
// The fixture's hips and ankles sit 0.2 m apart along x, its legs 0.9 m long; it faces along z.
const stride = body({});
stride.worldLandmarks[Joint.RIGHT_ANKLE] = { ...stride.worldLandmarks[Joint.RIGHT_ANKLE], z: -0.7 };

describe('spread', () => {
  it('reads the feet apart along the hips, and along the way they face, in leg lengths', () => {
    expect(sideways.read(body({}), 'left')?.value).toBeCloseTo(0.2 / 0.9);
    expect(forward.read(body({}), 'left')?.value).toBeCloseTo(0);
    expect(forward.read(stride, 'left')?.value).toBeCloseTo(0.7 / 0.9);
    expect(sideways.read(stride, 'left')?.value).toBeCloseTo(0.2 / 0.9);
  });

  it('reads a foot held up as not apart: a knee lift is no stride', () => {
    const lifted = structuredClone(stride);
    lifted.worldLandmarks[Joint.RIGHT_ANKLE].y = 0.5;
    expect(forward.read(lifted, 'left')?.value).toBe(0);
    // A heel lifting a little, as a lunge's back foot does, still counts.
    lifted.worldLandmarks[Joint.RIGHT_ANKLE].y = 0.8;
    expect(forward.read(lifted, 'left')?.value).toBeCloseTo(0.7 / 0.9);
  });

  it('reads nothing without gravity or with the other foot hidden', () => {
    expect(forward.read({ ...body({}), down: undefined }, 'left')).toBeNull();
    const hidden = body({});
    hidden.landmarks[Joint.RIGHT_ANKLE] = { ...hidden.landmarks[Joint.RIGHT_ANKLE], visibility: 0 };
    expect(forward.read(hidden, 'left')).toBeNull();
  });
});
