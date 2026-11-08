import { describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { body, onBack } from '@/exercises/__fixtures__/body';
import { elevation } from './elevation';

const thigh = elevation('thigh');

describe('elevation', () => {
  it('reads the hip over the knee in degrees: 90 upright, 20 tilted 70°', () => {
    expect(thigh.read(body({}), 'left')?.value).toBeCloseTo(90);
    expect(thigh.read(body({ thigh: 70, shin: 25 }), 'left')?.value).toBeCloseTo(20);
  });

  it('measures along gravity, not the camera: level when lying on the back', () => {
    expect(thigh.read(onBack({}), 'left')?.value).toBeCloseTo(0);
  });

  it('reads the torso up and the hips up as opposite signs of one line', () => {
    // 59°, not 60°: the fixture's shoulders sit wider than its hips.
    const sitting = onBack({ lean: 60 });
    expect(elevation('torso').read(sitting, 'left')?.value).toBeCloseTo(59, 0);
    expect(elevation('hips').read(sitting, 'left')).toMatchObject({
      value: expect.closeTo(-59, 0),
      // Drawn shoulder–hip–knee, the angle at the hip.
      joints: [Joint.LEFT_SHOULDER, Joint.LEFT_HIP, Joint.LEFT_KNEE],
    });
  });

  it('reads nothing without gravity', () => {
    expect(thigh.read({ ...body({}), down: undefined }, 'left')).toBeNull();
  });
});
