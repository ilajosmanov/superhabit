import { assert, describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { body } from './__fixtures__/body';
import { falseReps, scoreReps, tenPercent, traceFiles } from './__fixtures__/replay';
import type { Pose } from './geometry';
import { measureSitup, situp } from './situp';

const FRAME = 66;
// Bent thighs and shins from the body fixture; align shoulder and hip laterally for planar angles.
const pose = (hip = 60, knee = 90): Pose => {
  const result = body({ thigh: 60, shin: 120 - knee, lean: 120 - hip, side: true });
  result.worldLandmarks[Joint.LEFT_SHOULDER].z = result.worldLandmarks[Joint.LEFT_HIP].z;
  result.worldLandmarks[Joint.RIGHT_SHOULDER].z = result.worldLandmarks[Joint.RIGHT_HIP].z;
  return result;
};
const play = (spans: [Pose | null, from: number, to?: number][], start = situp.initial) =>
  spans.reduce((state, [body, from, to = from]) => {
    for (let t = from; t <= to; t += FRAME)
      state = situp.step(state, body && measureSitup(body), t);
    return state;
  }, start);

describe('measureSitup', () => {
  it('reads a curled torso and bent knee, then a larger lying hip angle', () => {
    const up = measureSitup(pose());
    assert(up);
    expect(up.hip).toBeCloseTo(60);
    expect(up.knee).toBeCloseTo(90);
    expect(up.joints).toEqual([Joint.LEFT_SHOULDER, Joint.LEFT_HIP, Joint.LEFT_KNEE]);
    expect(measureSitup(pose(130))?.hip).toBeCloseTo(130);
    expect(measureSitup(pose(60, 170))?.knee).toBeCloseTo(170);
  });

  it('measures the better-seen complete side, including ankle visibility', () => {
    const result = pose();
    result.landmarks[Joint.LEFT_ANKLE].visibility = 0.6;
    result.worldLandmarks[Joint.RIGHT_SHOULDER] = pose(70).worldLandmarks[Joint.RIGHT_SHOULDER];
    expect(measureSitup(result)).toMatchObject({
      hip: expect.closeTo(70),
      joints: [Joint.RIGHT_SHOULDER, Joint.RIGHT_HIP, Joint.RIGHT_KNEE],
    });
  });

  it('uses the other side when the near ankle is cropped', () => {
    const result = pose();
    result.landmarks[Joint.LEFT_ANKLE].x = 1.1;
    expect(measureSitup(result)?.joints).toEqual([
      Joint.RIGHT_SHOULDER,
      Joint.RIGHT_HIP,
      Joint.RIGHT_KNEE,
    ]);
  });

  it('does not require visible arms or world visibility scores', () => {
    const result = pose();
    for (const i of [Joint.LEFT_ELBOW, Joint.RIGHT_ELBOW, Joint.LEFT_WRIST, Joint.RIGHT_WRIST])
      result.landmarks[i].visibility = 0;
    for (const point of result.worldLandmarks) point.visibility = 0;
    expect(measureSitup(result)?.hip).toBeCloseTo(60);
  });

  it.each(['x', 'visibility'] as const)('rejects both ankles with invalid %s', (field) => {
    const result = pose();
    for (const ankle of [Joint.LEFT_ANKLE, Joint.RIGHT_ANKLE])
      result.landmarks[ankle][field] = field === 'x' ? 1.1 : 0.2;
    expect(measureSitup(result)).toBeNull();
  });

  it('rejects coincident joints and invalid world coordinates', () => {
    const result = pose();
    result.worldLandmarks[Joint.LEFT_KNEE] = result.worldLandmarks[Joint.LEFT_HIP];
    expect(measureSitup(result)).toBeNull();
    const invalid = pose();
    invalid.worldLandmarks[Joint.LEFT_SHOULDER].x = NaN;
    expect(measureSitup(invalid)).toBeNull();
  });

  it('keeps the same angles when the world rotates', () => {
    const result = pose(130);
    result.worldLandmarks = result.worldLandmarks.map(({ x, y, z, visibility }) => ({
      x: -y,
      y: z,
      z: x,
      visibility,
    }));
    expect(measureSitup(result)).toMatchObject({
      hip: expect.closeTo(130),
      knee: expect.closeTo(90),
    });
  });
});

describe('situp', () => {
  it('counts two complete lie-back and curl-up cycles, once each', () => {
    const result = play([
      [pose(), 0, 1500],
      [pose(130), 1566, 3000],
      [pose(), 3066, 4500],
      [pose(130), 4566, 6000],
      [pose(), 6066, 9000],
    ]);
    expect(result).toMatchObject({
      reps: 2,
      noReps: 0,
      phase: 'up',
      lastRep: { counted: true, cues: [], knee: expect.closeTo(90) },
    });
    expect(result.lastRep?.depth).toBeCloseTo(130, 0);
  });

  it('does not count lying down or a partial curl before the first seated start', () => {
    const waiting = play([
      [pose(130), 0, 1500],
      [pose(90), 1566, 3000],
    ]);
    expect(waiting).toMatchObject({ phase: 'waiting', reps: 0, noReps: 0, lastRep: null });
    expect(play([[pose(), 3066, 4500]], waiting)).toMatchObject({
      phase: 'up',
      reps: 0,
      noReps: 0,
      lastRep: null,
    });
  });

  it('requires a full curl back past the up threshold to finish a rep', () => {
    const pending = play([
      [pose(), 0, 1500],
      [pose(130), 1566, 3000],
      [pose(90), 3066, 4500],
    ]);
    expect(pending).toMatchObject({ phase: 'down', reps: 0, noReps: 0 });
    expect(play([[pose(), 4566, 6000]], pending)).toMatchObject({ reps: 1, noReps: 0 });
  });

  it('cues a shallow lie-back as a no-rep', () => {
    expect(
      play([
        [pose(), 0, 1500],
        [pose(105), 1566, 3000],
        [pose(), 3066, 4500],
      ]),
    ).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, cues: ['Lie back further'] },
    });
  });

  it('requires bent knees to establish the start position', () => {
    expect(
      play([
        [pose(60, 170), 0, 1500],
        [pose(130, 170), 1566, 3000],
        [pose(60, 170), 3066, 4500],
      ]),
    ).toMatchObject({ phase: 'waiting', reps: 0, noReps: 0 });
  });

  it('cues straightening the knees mid-rep even if both endpoints have bent knees', () => {
    expect(
      play([
        [pose(), 0, 1500],
        [pose(130), 1566, 2500],
        [pose(110, 170), 2566, 3500],
        [pose(), 3566, 5000],
      ]),
    ).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, cues: ['Keep your knees bent'] },
    });
  });

  it('returns to waiting after tracking loss and discards the unfinished rep', () => {
    const lost = play([
      [pose(), 0, 1500],
      [pose(130), 1566, 3000],
      [null, 3066, 4500],
    ]);
    expect(lost).toMatchObject({ phase: 'waiting', reps: 0, noReps: 0, lastRep: null });
    const back = play([[pose(), 4566, 6000]], lost);
    expect(back).toMatchObject({ phase: 'up', reps: 0, noReps: 0 });
    expect(
      play(
        [
          [pose(130), 6066, 7500],
          [pose(), 7566, 9000],
        ],
        back,
      ),
    ).toMatchObject({ reps: 1, noReps: 0 });
  });
});

// RepCount-A labels are whole torso cycles, not per-side reps; use them without rescaling.
// Measured baseline: 3/10 within max(1, round(10% of label)), below the required 6/10.
const MIN_OK = 3;
const files = traceFiles('situp');
describe.skipIf(files.length === 0)('situp on real traces', () => {
  it('preserves the measured baseline on labelled clips', () => {
    const rows = scoreReps(situp, files, tenPercent);
    expect(rows.filter((row) => row.ok).length, JSON.stringify(rows)).toBeGreaterThanOrEqual(
      MIN_OK,
    );
  });

  const others = ['squat', 'pushup', 'plank'];
  it.skipIf(others.some((e) => traceFiles(e).length === 0))(
    'counts no sit-ups on squat, push-up or plank traces',
    () => {
      expect(falseReps(situp, others)).toEqual({});
    },
  );
});
