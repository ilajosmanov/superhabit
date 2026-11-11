import { describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { body } from '@/exercises/__fixtures__/body';
import { angle, bestSide, seen, tilt } from './geometry';

const at = (x: number, y: number, z = 0) => ({ x, y, z });

describe('angle', () => {
  it('reads a right angle at the vertex and straight for collinear joints', () => {
    expect(angle(at(1, 0), at(0, 0), at(0, 1))).toBeCloseTo(90);
    expect(angle(at(-1, 0), at(0, 0), at(2, 0))).toBeCloseTo(180);
  });

  it('is NaN for coincident joints', () => {
    expect(angle(at(0, 0), at(0, 0), at(0, 1))).toBeNaN();
  });
});

describe('tilt', () => {
  it('is 0 straight down (y grows downwards) and 90 for a horizontal trunk', () => {
    expect(tilt(at(0, 1))).toBeCloseTo(0);
    expect(tilt(at(1, 0))).toBeCloseTo(90);
    expect(tilt(at(1, 1))).toBeCloseTo(45);
  });
});

describe('bestSide', () => {
  it('prefers the better-seen complete side and rejects a side with a joint out of frame', () => {
    const pose = body({});
    pose.landmarks[Joint.RIGHT_KNEE].visibility = 0.9;
    pose.landmarks[Joint.LEFT_KNEE].visibility = 0.6;
    expect(bestSide(pose, (j) => [j.hip, j.knee, j.ankle])).toBe('right');
    pose.landmarks[Joint.RIGHT_ANKLE].x = 1.2;
    expect(seen(pose, Joint.RIGHT_ANKLE)).toBe(false);
    expect(bestSide(pose, (j) => [j.hip, j.knee, j.ankle])).toBe('left');
  });
});
