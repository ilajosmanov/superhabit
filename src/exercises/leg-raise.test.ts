import { describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { figure } from './__fixtures__/figure';
import { legRaise, measureLegRaise, type LegRaiseState } from './leg-raise';

const { LEFT_SHOULDER: S, LEFT_HIP: H, LEFT_KNEE: K, LEFT_ANKLE: A } = Joint;
const RIGHT = [Joint.RIGHT_SHOULDER, Joint.RIGHT_HIP, Joint.RIGHT_KNEE, Joint.RIGHT_ANKLE];
const rad = Math.PI / 180;
/** y up from the floor, as world y down needs it negated. */
const at = (deg: number, r: number, from: readonly [number, number] = [0, 0]) =>
  [from[0] + r * Math.cos(deg * rad), from[1] - r * Math.sin(deg * rad)] as const;

/**
 * On the back, side-on from the left, head toward −x and hips at the origin. `legs`: thighs raised
 * off the floor, degrees; `knee`: shins bent back from the thigh line; `torso`: shoulders raised.
 */
const lying = ({ legs = 0, knee = 0, torso = 0 } = {}) => {
  const k = at(legs, 0.45);
  return figure(
    { [S]: at(180 - torso, 0.5), [H]: [0, 0], [K]: k, [A]: at(legs + knee, 0.45, k) },
    RIGHT,
  );
};

const FRAME = 66;
// Each position is held long enough for the smoothing filter to settle on it.
const run = (poses: ReturnType<typeof lying>[], from: LegRaiseState = legRaise.initial) =>
  poses.reduce<LegRaiseState>((state, pose) => {
    const start = (state.lastSeenAt ?? 0) + FRAME;
    for (let i = 0; i < 60; i++)
      state = legRaise.step(state, measureLegRaise(pose), start + i * FRAME);
    return state;
  }, from);

describe('leg raise', () => {
  it('reads the hip opening to 180° lying flat and 90° with legs straight up', () => {
    expect(measureLegRaise(lying())).toMatchObject({
      hip: expect.closeTo(180),
      knee: expect.closeTo(180),
      torso: expect.closeTo(0),
    });
    expect(measureLegRaise(lying({ legs: 90 }))?.hip).toBeCloseTo(90);
  });

  it('counts raising straight legs to vertical and lowering them', () => {
    expect(run([lying(), lying({ legs: 90 }), lying()])).toMatchObject({ reps: 1, noReps: 0 });
  });

  it('ignores a small lift and flags a half raise', () => {
    expect(run([lying(), lying({ legs: 30 }), lying()])).toMatchObject({ reps: 0, noReps: 0 });
    expect(run([lying(), lying({ legs: 60 }), lying()])).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: ['Raise your legs higher'] },
    });
  });

  it.each([
    ['bent knees', lying({ legs: 90, knee: 90 }), 'Keep your legs straight'],
    // A straight-leg sit-up closes the hip as much as a leg raise does.
    ['a sit-up', lying({ torso: 85 }), 'Keep your back on the floor'],
  ])('refuses %s', (_, top, cue) => {
    expect(run([lying(), top, lying()])).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: [cue] },
    });
  });

  it('waits to start until lying flat with straight legs', () => {
    expect(run([lying({ knee: 90 }), lying({ legs: 90 }), lying({ knee: 90 })]).reps).toBe(0);
  });
});
