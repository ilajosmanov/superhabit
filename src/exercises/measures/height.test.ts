import { describe, expect, it } from 'vite-plus/test';

import { body } from '@/exercises/__fixtures__/body';
import { height } from './height';

const thigh = height('thigh');

describe('height', () => {
  it('reads the hip over the knee in thigh lengths: 1 upright, cos 70° tilted 70°', () => {
    expect(thigh.read(body({}), 'left')?.value).toBeCloseTo(1);
    expect(thigh.read(body({ thigh: 70, shin: 25 }), 'left')?.value).toBeCloseTo(0.342);
  });

  it('measures along gravity, not the camera: level when lying on the back', () => {
    const lying = { ...body({}), down: { x: 0, y: 0, z: -1 } };
    expect(thigh.read(lying, 'left')?.value).toBeCloseTo(0);
  });

  it('reads nothing without gravity', () => {
    expect(thigh.read({ ...body({}), down: undefined }, 'left')).toBeNull();
  });
});
