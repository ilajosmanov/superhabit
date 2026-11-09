import { describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { body } from './__fixtures__/body';
import { clipSuite } from './__fixtures__/replay';
import type { Pose } from '@/exercises/body/geometry';
import { jumpingJack } from './jumping-jack';

const FRAME = 33;
// Vertical torso; straight arms rotate out from the sides. Hip width is 20 cm,
// ankles are 20 cm apart closed and 60 cm apart wide (three hip widths).
const pose = (abduction = 0, ankleHalfWidth = 0.1): Pose => {
  const result = body({});
  const rad = (abduction * Math.PI) / 180;
  for (const [s, e, w, h, a, sign] of [
    [Joint.LEFT_SHOULDER, Joint.LEFT_ELBOW, Joint.LEFT_WRIST, Joint.LEFT_HIP, Joint.LEFT_ANKLE, -1],
    [
      Joint.RIGHT_SHOULDER,
      Joint.RIGHT_ELBOW,
      Joint.RIGHT_WRIST,
      Joint.RIGHT_HIP,
      Joint.RIGHT_ANKLE,
      1,
    ],
  ]) {
    const shoulder = { x: result.worldLandmarks[h].x, y: -0.5, z: 0, visibility: 0.9 };
    result.worldLandmarks[s] = shoulder;
    for (const [joint, length] of [
      [e, 0.3],
      [w, 0.6],
    ])
      result.worldLandmarks[joint] = {
        ...shoulder,
        x: shoulder.x + sign * length * Math.sin(rad),
        y: shoulder.y + length * Math.cos(rad),
      };
    result.worldLandmarks[a].x = sign * ankleHalfWidth;
  }
  return result;
};
const play = (...poses: Pose[]) =>
  poses.reduce((state, p) => {
    const from = (state.lastSeenAt ?? -FRAME) + FRAME;
    for (let i = 0; i < 20; i++)
      state = jumpingJack.step(state, jumpingJack.measure(p), from + i * FRAME);
    return state;
  }, jumpingJack.initial);

describe('jumping jack', () => {
  it('counts each jump out with the arms overhead and back', () => {
    expect(play(pose(), pose(180, 0.3), pose(), pose(180, 0.3), pose())).toMatchObject({
      reps: 2,
      noReps: 0,
      lastRep: { counted: true, cues: [] },
    });
  });

  it('fails a jack with the arms short of overhead', () => {
    expect(play(pose(), pose(100, 0.3), pose())).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: ['Arms overhead, feet wide'] },
    });
  });

  it('ends a jack only once the feet are back together, whichever lands last', () => {
    // The arms land first, the feet stay wide: no rep yet, and no failed one.
    const landing = play(pose(), pose(180, 0.3), pose(0, 0.3));
    expect(landing).toMatchObject({ reps: 0, noReps: 0 });
    expect(play(pose(), pose(180, 0.3), pose(0, 0.3), pose())).toMatchObject({
      reps: 1,
      noReps: 0,
    });
  });

  it.each([
    ['the arms alone', pose(180, 0.1)],
    ['the feet alone', pose(0, 0.3)],
  ])('never counts %s', (_, open) => {
    expect(play(pose(), open, pose()).reps).toBe(0);
  });
});

// A device take with gravity, facing the phone, labelled from its video in trace seconds: each span
// holds one real jack, and no rep counts outside them. Between them: an arms-only jack (a failed rep),
// a knee kick, arms swung level, one arm raised at a time.
const JACKS: Record<string, [number, number][]> = {
  'jumping-jack-1794189250861.sht': [
    [9.7, 10.7],
    [10.7, 11.7],
    [11.7, 12.7],
    [21.2, 22.2],
    [22.2, 23.2],
    [23.2, 24.2],
    [24.2, 25.2],
    [31.7, 32.7],
    [32.7, 33.7],
    [33.7, 34.7],
  ],
};
clipSuite('jumping jack', jumpingJack, JACKS);
