import { describe, expect, it } from 'vite-plus/test';
import { Joint } from 'reprepgo-pose/joints';

import { body } from '@/exercises/__fixtures__/body';
import { loadTrace, toPose, traceFiles } from '@/exercises/__fixtures__/replay';
import { angle, bestSide, credible, seen, tilt } from './geometry';

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

// Device clips, read against their numbers: the burpee one starts with the phone still being set down,
// and from 26 to 32 s the detector reports thumb-sized skeletons with shoulders and hips it calls visible
// (trunks of 3–29 cm). The plank is 17 s of one clean hold, lying down.
describe('credible', () => {
  const clip = (name: string) => traceFiles('device').find((path) => path.endsWith(name));
  const burpee = clip('burpee-1794183187017.sht');
  const plank = clip('plank-1794169490623.sht');

  it.skipIf(!burpee || !plank)(
    'drops most collapsed skeletons of a search, keeps a real body',
    () => {
      const searching = loadTrace(burpee ?? '').frames.filter(
        (frame) => frame.landmarks.length > 0 && frame.t >= 29_000 && frame.t <= 31_000,
      );
      expect(searching.length).toBeGreaterThan(10);
      const kept = searching.filter((frame) => credible(toPose(frame)));
      expect(kept.length / searching.length).toBeLessThan(0.5);

      const holding = loadTrace(plank ?? '').frames.filter((frame) => frame.landmarks.length > 0);
      expect(holding.every((frame) => credible(toPose(frame)))).toBe(true);
    },
  );

  it('is false with nobody there', () => {
    expect(credible({ landmarks: [], worldLandmarks: [] })).toBe(false);
  });
});
