import { describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { lunge } from './lunge';
import type { Pose, Side } from '@/exercises/body/geometry';
import { body } from './__fixtures__/body';
import { clipSuite } from './__fixtures__/replay';

const LEGS = {
  left: [Joint.LEFT_HIP, Joint.LEFT_KNEE, Joint.LEFT_ANKLE],
  right: [Joint.RIGHT_HIP, Joint.RIGHT_KNEE, Joint.RIGHT_ANKLE],
} as const;
const standing = body({ side: true });

/** Side-on: one leg forward with its thigh `thigh`° from vertical, the other back, both knees bent. */
function split(front: Side, thigh: number, back: Pose, lean = 0, shin = 10): Pose {
  const result = body({ side: true, lean });
  const forward = body({ side: true, thigh, shin });
  for (const side of ['left', 'right'] as const)
    for (const i of LEGS[side])
      result.worldLandmarks[i] = (side === front ? forward : back).worldLandmarks[i];
  return result;
}
// Front knee 90°, back knee 105°: the back knee under the hip, its shin back along the floor.
const back = body({ side: true, thigh: -10, shin: 85 });
const deep = (front: Side) => split(front, 80, back);
// Both knees at 125°.
const half = (front: Side) => split(front, 45, body({ side: true, thigh: -10, shin: 65 }));

const FRAME = 66;
const play = (...steps: [Pose, number][]) => {
  let state = lunge.initial;
  let t = 0;
  for (const [pose, ms] of steps)
    for (const end = t + ms; t < end;) {
      t += FRAME;
      state = lunge.step(state, lunge.measure(pose), t);
    }
  return state;
};

describe('lunge', () => {
  it('counts a lunge with either leg forward', () => {
    expect(
      play(
        [standing, 1000],
        [deep('left'), 1000],
        [standing, 1000],
        [deep('right'), 1000],
        [standing, 1000],
      ),
    ).toMatchObject({ reps: 2, noReps: 0 });
  });

  it('fails a half lunge with the cue to go lower', () => {
    expect(play([standing, 1000], [half('left'), 1000], [standing, 1000])).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: ['Go lower'] },
    });
  });

  it.each([Joint.LEFT_SHOULDER, Joint.RIGHT_SHOULDER])(
    'fails a lunge leaning forward with the cue to keep upright, shoulder %i hidden',
    (hidden) => {
      const leaning = split('left', 80, back, 30);
      leaning.landmarks[hidden] = { ...leaning.landmarks[hidden], visibility: 0 };
      expect(play([standing, 1000], [leaning, 1000], [standing, 1000])).toMatchObject({
        reps: 0,
        noReps: 1,
        lastRep: { cues: ['Keep your torso upright'] },
      });
    },
  );

  it('fails a lunge whose shoulders are both out of view: an upright torso must be seen', () => {
    const unseen = deep('left');
    for (const i of [Joint.LEFT_SHOULDER, Joint.RIGHT_SHOULDER])
      unseen.landmarks[i] = { ...unseen.landmarks[i], visibility: 0 };
    expect(play([standing, 1000], [unseen, 1000], [standing, 1000])).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: ['Keep your torso upright'] },
    });
  });

  it.each([
    // Side-on, feet together, both knees bent.
    ['a squat', body({ side: true, thigh: 80, shin: 10 })],
    // One knee up, the standing leg straight.
    ['a knee lift', split('left', 90, standing)],
    // The knee up at 100°, its foot a stride ahead in the air; the standing knee soft at 146°, within
    // the gap.
    [
      'a knee lift with the foot forward',
      split('left', 90, body({ side: true, thigh: 17, shin: 17 }), 0, -10),
    ],
  ])('never counts %s', (_, pose) => {
    expect(play([standing, 1000], [pose, 1000], [standing, 1000]).reps).toBe(0);
  });
});

// Device takes with gravity, labelled from their video in trace seconds: each span holds one real
// lunge, and no rep counts outside them.
const LUNGES: Record<string, [number, number][]> = {
  // Eleven lunges. The first two step toward the phone and leave the frame (not counted); the rest
  // step back.
  'lunge-1794189125875.sht': [
    [17.2, 19.7],
    [20.7, 23.2],
    [24.2, 26.7],
    [27.2, 29.7],
    [31.2, 33.7],
    [35.2, 37.7],
    [42.7, 45.2],
    [46.2, 48.7],
    [50.5, 53],
  ],
  // Twelve reverse lunges; the first comes before the counter has started (not counted).
  'lunge-1794189198232.sht': [
    [21.9, 24.4],
    [25.4, 27.9],
    [29.4, 31.9],
    [32.7, 35.2],
    [38.9, 41.4],
    [42.4, 44.9],
    [45.9, 48.4],
    [49.2, 51.7],
    [53.2, 55.7],
    [57.9, 60.4],
    [62.9, 65.4],
  ],
  // Side-on: four lunges. Then facing the phone, seven stepping toward it: the front knee bends toward
  // the camera and reads 116–129° at the bottom, so only the last counts and four fail as too shallow.
  'lunge-1794189888569.sht': [
    [10.4, 13.4],
    [14.4, 17.4],
    [18.2, 21.2],
    [22.7, 25.7],
    [57.4, 60.4],
  ],
};
clipSuite('lunge', lunge, LUNGES);
