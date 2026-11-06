import { assert, describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { body } from './__fixtures__/body';
import { loadTrace, replay, traceFiles } from './__fixtures__/replay';
import type { Pose } from './geometry';
import { jumpingJack, measureJumpingJack } from './jumping-jack';

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
const play = (poses: (Pose | null)[], start = jumpingJack.initial) =>
  poses.reduce((state, p) => {
    const from = (state.lastSeenAt ?? -FRAME) + FRAME;
    for (let i = 0; i < 20; i++)
      state = jumpingJack.step(state, p && measureJumpingJack(p), from + i * FRAME);
    return state;
  }, start);

describe('measureJumpingJack', () => {
  it('reads closed, horizontal arms and overhead wide positions on a body fixture', () => {
    expect(measureJumpingJack(pose())).toMatchObject({ arms: 0, spread: 0, signal: 0 });
    expect(measureJumpingJack(pose(90, 0.3))).toMatchObject({
      arms: expect.closeTo(0.5),
      spread: 1,
      signal: expect.closeTo(0.5),
      joints: [Joint.LEFT_HIP, Joint.LEFT_SHOULDER, Joint.LEFT_ELBOW],
    });
    expect(measureJumpingJack(pose(180, 0.3))).toMatchObject({ arms: 1, spread: 1, signal: 1 });
  });

  it('requires both arm lift and foot spread, and normalises the stance by hip width', () => {
    expect(measureJumpingJack(pose(180))?.signal).toBe(0);
    expect(measureJumpingJack(pose(0, 0.3))?.signal).toBe(0);
    expect(measureJumpingJack(pose(180, 0.25))?.spread).toBeCloseTo(1);
    expect(measureJumpingJack(pose(180, 0.175))?.signal).toBeCloseTo(0.5);
    const scaled = pose(180, 0.175);
    for (const point of scaled.worldLandmarks) {
      point.x *= 2;
      point.y *= 2;
      point.z *= 2;
    }
    expect(measureJumpingJack(scaled)?.signal).toBeCloseTo(0.5);
  });

  it.each([Joint.LEFT_ELBOW, Joint.RIGHT_ELBOW, Joint.LEFT_ANKLE, Joint.RIGHT_ANKLE])(
    'rejects cropped or untracked joint %s',
    (joint) => {
      const cropped = pose();
      cropped.landmarks[joint].x = 1.1;
      expect(measureJumpingJack(cropped)).toBeNull();
      const hidden = pose();
      hidden.landmarks[joint].visibility = 0.05;
      expect(measureJumpingJack(hidden)).toBeNull();
    },
  );

  it('rejects coincident hips, collapsed arms and invalid world coordinates', () => {
    const hips = pose();
    hips.worldLandmarks[Joint.RIGHT_HIP] = hips.worldLandmarks[Joint.LEFT_HIP];
    expect(measureJumpingJack(hips)).toBeNull();
    const arm = pose();
    arm.worldLandmarks[Joint.LEFT_ELBOW] = arm.worldLandmarks[Joint.LEFT_SHOULDER];
    expect(measureJumpingJack(arm)).toBeNull();
    const invalid = pose();
    invalid.worldLandmarks[Joint.RIGHT_ANKLE].x = NaN;
    expect(measureJumpingJack(invalid)).toBeNull();
  });
});

describe('jumpingJack', () => {
  it('counts two complete closed–open–closed cycles, once each', () => {
    const state = play([pose(), pose(180, 0.3), pose(), pose(180, 0.3), pose()]);
    expect(state).toMatchObject({
      reps: 2,
      noReps: 0,
      phase: 'up',
      lastRep: { counted: true, cues: [] },
    });
    expect(state.lastRep?.depth).toBeGreaterThan(0.9);
    expect(jumpingJack.stats(state)).toContain('% OPEN');
    expect(jumpingJack.stats(jumpingJack.initial)).toBeNull();
  });

  it.each([
    { name: 'feet stay wide while the arms swing', arms: 0, width: 0.3 },
    { name: 'arms stay overhead while the feet move', arms: 180, width: 0.1 },
  ])('rejects repeated partial returns after arming when $name', ({ arms, width }) => {
    const armed = play([pose()]);
    expect(armed.phase).toBe('up');
    const partial = play(
      [pose(arms, width), pose(180, 0.3), pose(arms, width), pose(180, 0.3), pose(arms, width)],
      armed,
    );
    expect(partial).toMatchObject({
      reps: 0,
      noReps: 2,
      lastRep: { counted: false, cues: ['Bring feet together and arms down'] },
    });
    // Returning fully closed lets the next complete jumping jack count normally.
    expect(play([pose(), pose(180, 0.3), pose()], partial)).toMatchObject({
      reps: 1,
      noReps: 2,
      lastRep: { counted: true, cues: [] },
    });
  });

  it.each([
    { arms: 100, width: 0.3, cue: 'Raise your arms overhead' },
    { arms: 180, width: 0.175, cue: 'Jump your feet wider' },
  ])('rejects a shallow attempt with "$cue"', ({ arms, width, cue }) => {
    expect(play([pose(), pose(arms, width), pose()])).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, cues: [cue] },
    });
  });

  it('rejects arm and leg openings that never happen together', () => {
    expect(play([pose(), pose(180, 0.175), pose(90, 0.3), pose()])).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: ['Raise arms and spread feet together'] },
    });
  });

  it('waits for arms down AND feet together, including when starting open', () => {
    expect(play([pose(180, 0.3), pose(90, 0.3)])).toMatchObject({
      phase: 'waiting',
      reps: 0,
      noReps: 0,
    });
    expect(play([pose(0, 0.3), pose(180, 0.3), pose(0, 0.3)])).toMatchObject({
      phase: 'waiting',
      reps: 0,
      noReps: 0,
    });
    const closed = play([pose(180, 0.3), pose()]);
    expect(closed).toMatchObject({ reps: 0, noReps: 0, phase: 'up' });
    expect(play([pose(180, 0.3), pose()], closed).reps).toBe(1);
  });

  it('discards an unfinished cycle after tracking loss and requires the start again', () => {
    const open = play([pose(), pose(180, 0.3)]);
    assert(open.lastSeenAt !== undefined);
    const lost = jumpingJack.step(open, null, open.lastSeenAt + 1001);
    expect(lost).toMatchObject({ phase: 'waiting', reps: 0, noReps: 0, lastRep: null });
    expect(lost.filter).toBeUndefined();
    const back = jumpingJack.step(lost, measureJumpingJack(pose(180, 0.3)), open.lastSeenAt + 1100);
    expect(play([pose(180, 0.3)], back)).toMatchObject({ phase: 'waiting', reps: 0 });
    expect(play([pose(), pose(180, 0.3), pose()], back)).toMatchObject({ reps: 1, noReps: 0 });
  });
});

// PushUpBench names and RepCount-A front-view labels provide whole-exercise rep counts,
// with no per-side unit. Compare full closed–open–closed cycles directly, without rescaling.
// With both limbs required closed: 6/11 within max(1, round(10% of label)); registration needs 7/11.
const MIN_OK = 6;
const files = traceFiles('jumping-jack');
describe.skipIf(files.length === 0)('jumpingJack on real traces', () => {
  it('preserves the measured baseline on labelled clips', () => {
    const rows = files.flatMap((path) => {
      const trace = loadTrace(path);
      if (trace.labels.reps === undefined) return [];
      const expected = trace.labels.reps;
      const got = replay(jumpingJack, trace).reps;
      return [
        {
          clip: trace.source.clip,
          expected,
          got,
          ok: Math.abs(got - expected) <= Math.max(1, Math.round(0.1 * expected)),
        },
      ];
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => row.ok).length, JSON.stringify(rows)).toBeGreaterThanOrEqual(
      MIN_OK,
    );
  });

  for (const exercise of ['squat', 'pushup', 'plank']) {
    const others = traceFiles(exercise);
    it.skipIf(others.length === 0)(`counts no false reps on ${exercise} traces`, () => {
      const rows = others.map((path) => {
        const trace = loadTrace(path);
        return { clip: trace.source.clip, reps: replay(jumpingJack, trace).reps };
      });
      expect(
        rows.reduce((total, row) => total + row.reps, 0),
        JSON.stringify(rows),
      ).toBe(0);
    });
  }
});
