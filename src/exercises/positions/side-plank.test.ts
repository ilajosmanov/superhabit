import { describe, expect, it } from 'vite-plus/test';
import { SIDE } from 'reprepgo-pose/joints';

import { figure } from '@/exercises/__fixtures__/figure';
import type { Pose } from '@/exercises/body/geometry';
import type { HoldState } from '@/exercises/kinds/hold';
import { sidePlank } from '@/exercises/side-plank';
import { measureSidePlank } from './side-plank';

type P = readonly [number, number, number?];
/**
 * Facing the camera on the left forearm (elbow under the shoulder, forearm toward the camera), the body
 * along x, floor at y = 0, y down. The right side sits 0.3 m above the left one, or, face down, 0.3 m
 * deeper. `lying`: hips, knees and ankles all on the floor, propped on the elbow.
 */
/** A drawn figure with the phone's gravity along its y. */
const gravityOn = (...args: Parameters<typeof figure>): Pose => ({
  ...figure(...args),
  down: { x: 0, y: 1, z: 0 },
});
const PARTS = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'] as const;
function pose({
  lying = false,
  sag = false,
  faceDown = false,
  hidden = [],
}: { lying?: boolean; sag?: boolean; faceDown?: boolean; hidden?: number[] } = {}): Pose {
  const low: Record<(typeof PARTS)[number], P> = {
    shoulder: [0, -0.3],
    elbow: [0, 0],
    wrist: [0, 0, -0.25],
    // Straight: on the shoulder–ankle line, a third and two thirds of the way.
    hip: [0.5, lying ? 0 : sag ? -0.05 : -0.2],
    knee: [1, lying ? 0 : -0.1],
    ankle: [1.5, 0],
  };
  const points: Record<number, P> = {};
  for (const part of PARTS) {
    const [x, y, z = 0] = low[part];
    points[SIDE.left[part]] = [x, y, z];
    if (part !== 'elbow' && part !== 'wrist')
      points[SIDE.right[part]] = faceDown ? [x, y, z - 0.3] : [x, y - 0.3, z];
  }
  return gravityOn(points, hidden);
}

const FRAME = 66;
const play = (body: Pose, ms: number, state = sidePlank.initial): HoldState => {
  for (let t = FRAME; t <= ms; t += FRAME)
    state = sidePlank.step(state, sidePlank.measure(body), t);
  return state;
};

describe('side plank', () => {
  it('reads a straight body with stacked shoulders and the hips halfway up', () => {
    expect(measureSidePlank(pose())).toMatchObject({
      body: expect.closeTo(180),
      knees: expect.closeTo(180),
      hips: expect.closeTo(2 / 3),
      joints: [SIDE.left.shoulder, SIDE.left.hip, SIDE.left.ankle],
    });
    // Not quite 0: up is square to the support line, and the feet sit lower than the elbow.
    expect(measureSidePlank(pose())?.stack).toBeLessThan(10);
  });

  it('times a held side plank', () => {
    expect(play(pose(), 2000)).toMatchObject({ phase: 'active', heldMs: expect.any(Number) });
    expect(play(pose(), 2000).heldMs).toBeGreaterThan(1500);
  });

  it.each([
    ['lying on the side', pose({ lying: true }), 'Lift your hips'],
    ['a face-down plank', pose({ faceDown: true }), 'Turn onto your side, facing the phone'],
    // Standing square to the camera also shows both shoulders and a straight body.
    [
      'standing',
      gravityOn(
        Object.fromEntries(
          (['left', 'right'] as const).flatMap((side, i) => {
            const x = i ? 0.18 : -0.18;
            const { shoulder, elbow, hip, knee, ankle } = SIDE[side];
            return [
              [shoulder, [x, -1.45]],
              [elbow, [x, -1.15]],
              [hip, [x / 2, -0.9]],
              [knee, [x / 2, -0.45]],
              [ankle, [x / 2, 0]],
            ];
          }),
        ),
      ),
      'Lie on your side, on one forearm',
    ],
  ])('does not time %s and says why', (_, body, cue) => {
    expect(play(body, 2000)).toMatchObject({ phase: 'waiting', heldMs: 0, cue });
  });

  it('pauses the clock while the hips sag, with the cue, without breaking the hold', () => {
    const held = play(pose(), 2000);
    let state = held;
    for (let t = 2000 + FRAME; t <= 4000; t += FRAME)
      state = sidePlank.step(state, sidePlank.measure(pose({ sag: true })), t);
    expect(state).toMatchObject({ phase: 'active', noReps: 1, cue: 'Lift your hips' });
    expect(state.heldMs).toBeLessThan(held.heldMs + 1000);
  });

  it('reads nothing without gravity', () => {
    expect(measureSidePlank({ ...pose(), down: undefined })).toBeNull();
  });

  it('rests on the lower arm, and needs its elbow seen', () => {
    expect(measureSidePlank(pose({ hidden: [SIDE.left.elbow] }))).toBeNull();
    // The upper arm is free, raised or out of frame.
    expect(measureSidePlank(pose({ hidden: [SIDE.right.elbow, SIDE.right.wrist] }))).not.toBeNull();
  });
});
