import { assert, describe, expect, it } from 'vite-plus/test';
import { Joint, SIDE } from 'superhabit-pose/joints';

import { body } from './__fixtures__/body';
import { falseReps, scoreReps, tenPercent, traceFiles } from './__fixtures__/replay';
import { gluteBridge, measureGluteBridge } from './glute-bridge';
import type { Pose } from './geometry';

const FRAME = 66;
// Fixed shoulder and ankle supports. The hip rises from a flat torso to a straight body line;
// a 30–65° knee stays bent. Start from body() so image points and the other joints remain valid.
const pose = (height = 0, lift = 0, straightKnee = false): Pose => {
  const result = body({ side: true });
  for (const { shoulder: s, hip: h, knee: k, ankle: a } of [SIDE.left, SIDE.right]) {
    const z = result.worldLandmarks[h].z;
    result.worldLandmarks[s] = { x: 0, y: 0, z, visibility: 0.9 };
    result.worldLandmarks[h] = { x: height === 0 ? 0.5 : 0.4, y: -height, z, visibility: 0.9 };
    result.worldLandmarks[k] = { x: 0.8, y: -0.4 - lift, z, visibility: 0.9 };
    result.worldLandmarks[a] = {
      x: straightKnee ? 1.5 : 0.8,
      y: straightKnee ? -0.4 : -lift,
      z,
      visibility: 0.9,
    };
  }
  return result;
};
const play = (spans: [Pose | null, from: number, to?: number][], start = gluteBridge.initial) =>
  spans.reduce((state, [body, from, to = from]) => {
    for (let t = from; t <= to; t += FRAME)
      state = gluteBridge.step(state, body && measureGluteBridge(body), t);
    return state;
  }, start);

// Down/start and fully extended poses have fixed supports; ~153° is a shallow lift.
const floor = () => pose();
const top = () => pose(0.2);
const shallow = () => pose(0.08);
describe('measureGluteBridge', () => {
  it('reads the hip extension angle and bent knee on the body fixture', () => {
    const sample = measureGluteBridge(floor());
    assert(sample);
    expect(sample.hip).toBeCloseTo(126.87, 2);
    expect(sample.knee).toBeCloseTo(36.87, 2);
    expect(sample.floor).toBeCloseTo(0);
    expect(measureGluteBridge(top())?.hip).toBeCloseTo(180);
    expect(sample.joints).toEqual([Joint.LEFT_SHOULDER, Joint.LEFT_HIP, Joint.LEFT_KNEE]);
  });

  it('uses the better-seen complete side, including its ankle', () => {
    const result = floor();
    result.landmarks[Joint.LEFT_ANKLE].visibility = 0.6;
    result.worldLandmarks[Joint.RIGHT_HIP] = top().worldLandmarks[Joint.RIGHT_HIP];
    expect(measureGluteBridge(result)).toMatchObject({
      hip: expect.closeTo(180),
      joints: [Joint.RIGHT_SHOULDER, Joint.RIGHT_HIP, Joint.RIGHT_KNEE],
    });
    result.landmarks[Joint.RIGHT_ANKLE].x = 1.1;
    expect(measureGluteBridge(result)?.joints[0]).toBe(Joint.LEFT_SHOULDER);
  });

  it.each(['visibility', 'x'] as const)('rejects unseen ankles (%s)', (field) => {
    const result = floor();
    for (const a of [Joint.LEFT_ANKLE, Joint.RIGHT_ANKLE])
      result.landmarks[a][field] = field === 'visibility' ? 0.1 : 1.1;
    expect(measureGluteBridge(result)).toBeNull();
  });

  it('rejects coincident joints and invalid world coordinates', () => {
    const result = floor();
    result.worldLandmarks[Joint.LEFT_KNEE] = result.worldLandmarks[Joint.LEFT_HIP];
    expect(measureGluteBridge(result)).toBeNull();
    const invalid = floor();
    invalid.worldLandmarks[Joint.LEFT_SHOULDER].x = NaN;
    expect(measureGluteBridge(invalid)).toBeNull();
  });

  it('keeps the signal and support gates when the world rotates', () => {
    const rotate = (p: Pose): Pose => ({
      ...p,
      worldLandmarks: p.worldLandmarks.map(({ x, y, z, visibility }) => ({
        x: -y,
        y: z,
        z: x,
        visibility,
      })),
    });
    expect(
      play([
        [rotate(floor()), 0, 1500],
        [rotate(top()), 1566, 3000],
        [rotate(floor()), 3066, 4500],
      ]),
    ).toMatchObject({ reps: 1, noReps: 0 });
  });
});

describe('gluteBridge', () => {
  it('counts two complete lifts and lowers once each, with depth in the rising range', () => {
    const result = play([
      [floor(), 0, 1500],
      [top(), 1566, 3000],
      [floor(), 3066, 4500],
      [top(), 4566, 6000],
      [floor(), 6066, 9000],
    ]);
    expect(result).toMatchObject({
      reps: 2,
      noReps: 0,
      lastRep: { counted: true, cues: [] },
    });
    expect(result.lastRep?.depth).toBeCloseTo(180, 0);
    expect(gluteBridge.stats(result)).toMatch(/^180° · KNEE 63° · [\d.]+s↑ [\d.]+s↓$/);
  });

  it('counts nothing before the first hips-down start', () => {
    const waiting = play([
      [top(), 0, 1500],
      [shallow(), 1566, 3000],
    ]);
    expect(waiting).toMatchObject({ phase: 'waiting', reps: 0, noReps: 0, lastRep: null });
    expect(play([[floor(), 3066, 4500]], waiting)).toMatchObject({
      phase: 'up',
      reps: 0,
      noReps: 0,
      lastRep: null,
    });
  });

  it.each(['left', 'right'] as const)(
    'counts clean reps when visibility switches away from the %s side mid-lift',
    (first) => {
      const favour = (p: Pose, side: 'left' | 'right') => {
        p.landmarks[side === 'left' ? Joint.RIGHT_ANKLE : Joint.LEFT_ANKLE].visibility = 0.89;
        return p;
      };
      const other = first === 'left' ? 'right' : 'left';
      expect(
        play([
          [favour(floor(), first), 0, 1500],
          [favour(top(), other), 1566, 3000],
          [favour(floor(), first), 3066, 4500],
          [favour(top(), first), 4566, 6000],
          [favour(floor(), other), 6066, 7500],
        ]),
      ).toMatchObject({ reps: 2, noReps: 0, lastRep: { counted: true, cues: [] } });
    },
  );

  it('requires lowering back to the floor to complete a rep', () => {
    expect(
      play([
        [floor(), 0, 1500],
        [top(), 1566, 3000],
        [shallow(), 3066, 4500],
      ]),
    ).toMatchObject({ phase: 'down', reps: 0, noReps: 0 });
  });

  it('cues a shallow lift as a no-rep', () => {
    expect(
      play([
        [floor(), 0, 1500],
        [shallow(), 1566, 3000],
        [floor(), 3066, 4500],
      ]),
    ).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, cues: ['Lift your hips higher'] },
    });
  });

  it('requires bent knees and a floor setup before starting', () => {
    expect(play([[body({}), 0, 1500]])).toMatchObject({ phase: 'waiting', reps: 0 });
    expect(play([[pose(0, 0, true), 0, 1500]])).toMatchObject({ phase: 'waiting', reps: 0 });
    // A crouch has both hip and knee angles in range, but its shoulders are far above its feet.
    const crouch = body({ thigh: 70, shin: 25 });
    const sample = measureGluteBridge(crouch);
    assert(sample);
    expect(sample.hip).toBeLessThan(140);
    expect(sample.knee).toBeLessThan(140);
    expect(sample.floor).toBeGreaterThan(1);
    expect(play([[crouch, 0, 1500]])).toMatchObject({ phase: 'waiting', reps: 0 });
  });

  it('cues straightening the knees in the middle of an otherwise complete rep', () => {
    expect(
      play([
        [floor(), 0, 1500],
        [top(), 1566, 2500],
        [pose(0.2, 0, true), 2566, 3500],
        [floor(), 3566, 5000],
      ]),
    ).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, cues: ['Keep your knees bent'] },
    });
  });

  it('returns to waiting after tracking loss and discards the unfinished rep', () => {
    const lost = play([
      [floor(), 0, 1500],
      [top(), 1566, 3000],
      [null, 3066, 4500],
    ]);
    expect(lost).toMatchObject({ phase: 'waiting', reps: 0, noReps: 0, lastRep: null });
    expect(play([[top(), 4566, 6000]], lost)).toMatchObject({ phase: 'waiting', reps: 0 });
    expect(
      play(
        [
          [floor(), 6066, 7500],
          [top(), 7566, 9000],
          [floor(), 9066, 10500],
        ],
        lost,
      ),
    ).toMatchObject({ reps: 1, noReps: 0 });
  });
});

// PushUpBench labels are full bridge cycles, including separately labelled single-leg sets.
// Compare directly: no per-leg doubling or pairing.
// Measured baseline: 2/10 within max(1, round(10% of label)), below the required 6/10.
const MIN_OK = 2;
const files = traceFiles('glute-bridge');
describe.skipIf(files.length === 0)('gluteBridge on real traces', () => {
  it('preserves the measured baseline on labelled clips', () => {
    const rows = scoreReps(gluteBridge, files, tenPercent);
    expect(rows.filter((row) => row.ok).length, JSON.stringify(rows)).toBeGreaterThanOrEqual(
      MIN_OK,
    );
  });

  const others = ['squat', 'pushup', 'plank'];
  it.skipIf(others.some((e) => traceFiles(e).length === 0))(
    'counts no false reps on squat, push-up or plank traces',
    () => {
      expect(falseReps(gluteBridge, others)).toEqual({});
    },
  );
});
