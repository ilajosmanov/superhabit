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

  it('ignores how far one foot sits above the other', () => {
    const lifted = body({});
    lifted.worldLandmarks[Joint.RIGHT_ANKLE] = {
      ...lifted.worldLandmarks[Joint.RIGHT_ANKLE],
      y: 0.4,
    };
    expect(sideways.read(lifted, 'left')?.value).toBeCloseTo(0.2 / 0.9);
  });

  it('reads nothing without gravity or with the other foot hidden', () => {
    expect(forward.read({ ...body({}), down: undefined }, 'left')).toBeNull();
    const hidden = body({});
    hidden.landmarks[Joint.RIGHT_ANKLE] = { ...hidden.landmarks[Joint.RIGHT_ANKLE], visibility: 0 };
    expect(forward.read(hidden, 'left')).toBeNull();
  });
});
