import { describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { figure } from './__fixtures__/figure';
import type { Pose } from './geometry';
import type { HoldState } from './hold';
import { measureWallSit, wallSit } from './wall-sit';

const { LEFT_SHOULDER: S, LEFT_HIP: H, LEFT_KNEE: K, LEFT_ANKLE: A } = Joint;
const RIGHT = [Joint.RIGHT_SHOULDER, Joint.RIGHT_HIP, Joint.RIGHT_KNEE, Joint.RIGHT_ANKLE];
type P = readonly [number, number];
/** Side-on from the left, the right side hidden; y is down, hips at the origin. */
const sit = (shoulder: P, knee: P, ankle: P) =>
  figure({ [S]: shoulder, [H]: [0, 0], [K]: knee, [A]: ankle }, RIGHT);

// Back upright, thighs level, shins vertical: 90° at hip and knee.
const seated = sit([0, -0.5], [0.45, 0], [0.45, 0.45]);
const standing = sit([0, -0.5], [0, 0.45], [0, 0.9]);
// Torso 37° forward of vertical (a 3-4-5 triangle), thighs level.
const leaning = sit([0.3, -0.4], [0.45, 0], [0.45, 0.45]);
// Knee bent to 45°: down in a deep squat.
const deep = sit([0, -0.5], [0.45, 0], [0.1, 0.35]);

const FRAME = 66;
const play = (pose: Pose, ms: number, state = wallSit.initial): HoldState => {
  for (let t = FRAME; t <= ms; t += FRAME) state = wallSit.step(state, wallSit.measure(pose), t);
  return state;
};

describe('wall sit', () => {
  it('measures right angles at hip and knee with the back upright', () => {
    expect(measureWallSit(seated)).toMatchObject({
      knee: expect.closeTo(90),
      hip: expect.closeTo(90),
      lean: expect.closeTo(0),
    });
  });

  it('times a held wall sit', () => {
    const s = play(seated, 2000);
    expect(s.phase).toBe('active');
    expect(s.heldMs).toBeGreaterThan(1500);
  });

  it.each([
    ['standing', standing, 'Slide down until your thighs are level'],
    ['leaning forward', leaning, 'Keep your back on the wall'],
    ['too deep', deep, 'Come up until your thighs are level'],
    // Torso upright and thighs level, but the hips down by the heels.
    ['sitting on the floor', sit([0, -0.5], [0.45, -0.3], [0.7, 0]), 'Sit back against the wall'],
  ])('does not time %s and says why', (_, pose, cue) => {
    expect(play(pose, 2000)).toMatchObject({ phase: 'waiting', heldMs: 0, cue });
  });

  it('needs the near side seen', () => {
    expect(measureWallSit(figure({ [S]: [0, -0.5], [K]: [0.45, 0] }, [H, ...RIGHT]))).toBeNull();
  });
});
