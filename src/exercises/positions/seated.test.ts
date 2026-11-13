import { assert, describe, expect, it } from 'vite-plus/test';
import { Joint } from 'reprepgo-pose/joints';

import { body } from '@/exercises/__fixtures__/body';
import type { Pose } from '@/exercises/body/geometry';
import { inTheAirPosition } from './seated';

const at = (pose: Pose) => {
  const m = inTheAirPosition.read(pose);
  assert(m);
  return m;
};
// Thighs level, shins and back upright.
const wallSit = body({ thigh: 90 });
// The near leg as in a wall sit, the far knee a thigh length lower: a lunge held at the bottom.
const lunge = body({ thigh: 90 });
lunge.worldLandmarks[Joint.RIGHT_KNEE] = { ...lunge.worldLandmarks[Joint.RIGHT_KNEE], y: 0.45 };
const hidden = { ...lunge, landmarks: [...lunge.landmarks] };
hidden.landmarks[Joint.RIGHT_KNEE] = { ...hidden.landmarks[Joint.RIGHT_KNEE], visibility: 0 };

describe('seated in the air', () => {
  it('reads the thigh, shin and torso against gravity', () => {
    expect(at(wallSit)).toMatchObject({
      thigh: expect.closeTo(0),
      shin: expect.closeTo(90),
      // 81°, not 90°: the fixture's shoulders sit wider than its hips.
      torso: expect.closeTo(81, 0),
      knees: expect.closeTo(0),
      joints: [Joint.LEFT_HIP, Joint.LEFT_KNEE, Joint.LEFT_ANKLE],
    });
  });

  it('reads nothing without gravity', () => {
    expect(inTheAirPosition.read({ ...wallSit, down: undefined })).toBeNull();
  });

  it.each([
    ['a wall sit', wallSit, null],
    ['standing', body({}), 'Slide down until your thighs are level'],
    [
      'sunk with the hips well under the knees',
      body({ thigh: 145 }),
      'Come up until your thighs are level',
    ],
    [
      'sitting on the floor, hugging the knees',
      body({ thigh: 150, shin: 30 }),
      'Sit back against the wall',
    ],
    // Thighs level, shins and back forward to balance: no wall behind.
    ['a held squat', body({ thigh: 90, shin: 35, lean: 35 }), 'Sit back against the wall'],
    ['leaning off the wall', body({ thigh: 90, lean: 30 }), 'Keep your back on the wall'],
    ['a lunge held at the bottom', lunge, 'Feet side by side'],
    // Side-on, the far knee is often hidden and its spot a guess: it doesn't refuse.
    ['a wall sit, the far knee hidden', hidden, null],
  ])('setup: %s', (_, pose, cue) => {
    expect(inTheAirPosition.setup(at(pose))).toBe(cue);
  });

  it.each([
    ['thighs level', wallSit, null],
    ['hips slid up', body({ thigh: 50 }), 'Slide down until your thighs are level'],
    ['hips below the knees', body({ thigh: 130 }), 'Come up until your thighs are level'],
  ])('form: %s', (_, pose, cue) => {
    const m = at(pose);
    expect(inTheAirPosition.setup(m)).toBeNull();
    expect(inTheAirPosition.form(m)).toBe(cue);
  });
});
