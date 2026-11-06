import { assert, describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { initialPushup, measurePushup, stepPushup, type PushupState } from './pushup';
import type { Pose } from './geometry';
import { plank } from './__fixtures__/plank';
import { scoreReps, traceFiles } from './__fixtures__/replay';

const FRAME = 66; // ms between detector results
// [pose, fromMs, toMs]: hold a pose long enough for the smoothing filter to settle.
const play = (spans: [Pose | null, from: number, to?: number][], start = initialPushup) =>
  spans.reduce<PushupState>((state, [pose, from, to = from]) => {
    for (let t = from; t <= to; t += FRAME)
      state = stepPushup(state, pose && measurePushup(pose), t);
    return state;
  }, start);
// The camera loses the near ankle (low on the floor, or past the frame edge).
const heelsOut = (pose: Pose): Pose => {
  pose.landmarks[Joint.LEFT_ANKLE] = { ...pose.landmarks[Joint.LEFT_ANKLE], visibility: 0.2 };
  return pose;
};
// Top, bottom, top, 1.5 s each.
const cycle = (top: Pose, bottom: Pose) =>
  play([
    [top, 0, 1500],
    [bottom, 1566, 3000],
    [top, 3066, 4500],
  ]);

describe('measurePushup', () => {
  it('reads elbow, body line and reach from the better-seen side', () => {
    const top = measurePushup(plank({ elbow: 170 }));
    assert(top);
    expect(top.elbow).toBeCloseTo(170);
    expect(top.body).toBeCloseTo(180);
    expect(top.reach).toBeGreaterThan(40);
    expect(measurePushup(plank({ sag: 40 }))?.body).toBeCloseTo(140);
    expect(measurePushup(plank({ elbow: 80, visible: 'right' }))?.elbow).toBeCloseTo(80);
    expect(measurePushup(plank({ standing: true }))?.reach).toBeLessThan(40);
  });

  it('reports the shoulder, elbow and wrist of the side it measured', () => {
    expect(measurePushup(plank({}))?.joints).toEqual([
      Joint.LEFT_SHOULDER,
      Joint.LEFT_ELBOW,
      Joint.LEFT_WRIST,
    ]);
    expect(measurePushup(plank({ visible: 'right' }))?.joints).toEqual([
      Joint.RIGHT_SHOULDER,
      Joint.RIGHT_ELBOW,
      Joint.RIGHT_WRIST,
    ]);
  });

  it('measures the other side when the better-seen knee is hidden', () => {
    const pose = plank({ elbow: 80, visible: 'both' });
    pose.landmarks[Joint.LEFT_KNEE] = { ...pose.landmarks[Joint.LEFT_KNEE], visibility: 0.1 };
    expect(measurePushup(pose)?.elbow).toBeCloseTo(80);
  });

  it('is null when the seen arm leaves the frame', () => {
    const cropped = plank({});
    cropped.landmarks[Joint.LEFT_WRIST] = { ...cropped.landmarks[Joint.LEFT_WRIST], x: 1.1 };
    expect(measurePushup(cropped)).toBeNull();
  });

  it('reads the body line from the knee when the heels are out of view', () => {
    expect(measurePushup(heelsOut(plank({ sag: 40 })))?.body).toBeGreaterThan(130);
    expect(measurePushup(heelsOut(plank({ sag: 40 })))?.body).toBeLessThan(150);
    expect(measurePushup(heelsOut(plank({})))?.body).toBeCloseTo(180);
  });
});

describe('stepPushup', () => {
  it('waits for a plank top before counting', () => {
    expect(play([[plank({ elbow: 80 }), 0, 1500]])).toMatchObject({ phase: 'waiting' });
    const fromBottom = play([
      [plank({ elbow: 80 }), 0, 1500],
      [plank({ elbow: 170 }), 1566, 3000],
    ]);
    expect(fromBottom).toMatchObject({ reps: 0, noReps: 0, phase: 'up' });
  });

  it('counts with the heels out of view, at the bottom or throughout', () => {
    const top = plank({ elbow: 170 });
    expect(cycle(top, heelsOut(plank({ elbow: 80 })))).toMatchObject({ reps: 1, noReps: 0 });
    expect(cycle(heelsOut(top), heelsOut(plank({ elbow: 80 })))).toMatchObject({ reps: 1 });
  });

  it('never counts knee push-ups, heels in view or not', () => {
    const top = plank({ elbow: 170, kneeling: true });
    const bottom = plank({ elbow: 80, kneeling: true });
    expect(cycle(top, bottom)).toMatchObject({ reps: 0, phase: 'waiting' });
    expect(cycle(heelsOut(top), heelsOut(bottom))).toMatchObject({ reps: 0, phase: 'waiting' });
  });

  it('turns a rep that sags on the way up into a no-rep', () => {
    const state = play([
      [plank({ elbow: 170 }), 0, 1500],
      [plank({ elbow: 80 }), 1566, 3000],
      [plank({ elbow: 170, sag: 40 }), 3066, 4500],
    ]);
    expect(state).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: ['Keep your body straight'] },
    });
  });

  it('turns a rep finished on the knees into a no-rep', () => {
    const state = play([
      [plank({ elbow: 170 }), 0, 1500],
      [plank({ elbow: 80 }), 1566, 3000],
      [plank({ elbow: 170, kneeling: true }), 3066, 4500],
    ]);
    expect(state).toMatchObject({ reps: 0, noReps: 1, lastRep: { cues: ['Knees off the floor'] } });
  });

  it('counts a full push-up once', () => {
    expect(cycle(plank({ elbow: 170 }), plank({ elbow: 80 }))).toMatchObject({
      reps: 1,
      noReps: 0,
      phase: 'up',
      lastRep: { counted: true, cues: [] },
    });
  });

  it('counts with the far arm hidden on either side', () => {
    const right = cycle(
      plank({ elbow: 170, visible: 'right' }),
      plank({ elbow: 80, visible: 'right' }),
    );
    expect(right.reps).toBe(1);
  });

  it('flags a half push-up as a no-rep', () => {
    expect(cycle(plank({ elbow: 170 }), plank({ elbow: 110 }))).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, cues: ['Go lower'] },
    });
  });

  it('never counts sagging hips', () => {
    expect(cycle(plank({ elbow: 170 }), plank({ elbow: 80, sag: 40 }))).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: ['Keep your body straight'] },
    });
    expect(cycle(plank({ elbow: 170, sag: 40 }), plank({ elbow: 80, sag: 40 }))).toMatchObject({
      reps: 0,
      phase: 'waiting',
    });
  });

  it('never arms while standing with the arms down', () => {
    expect(
      cycle(plank({ standing: true, elbow: 175 }), plank({ standing: true, elbow: 80 })),
    ).toMatchObject({ reps: 0, noReps: 0, phase: 'waiting' });
  });

  it('returns to waiting after a tracking gap', () => {
    const lost = play([
      [plank({ elbow: 170 }), 0, 1500],
      [plank({ elbow: 80 }), 1566, 2000],
      [null, 2500, 3500],
      [plank({ elbow: 80 }), 3566, 4500],
    ]);
    expect(lost.phase).toBe('waiting');
    expect(play([[plank({ elbow: 170 }), 4566, 6000]], lost)).toMatchObject({
      reps: 0,
      phase: 'up',
    });
  });
});

// 87a35a1: 2/10 within ±1. Measured baseline; counter refactors must not lower it.
const MIN_OK = 2;
const files = traceFiles('pushup');
describe.skipIf(files.length === 0)('pushup on real traces', () => {
  it('counts within ±1 on enough clips', () => {
    const rows = scoreReps(
      { initial: initialPushup, step: stepPushup, measure: measurePushup },
      files,
      1,
    );
    expect(rows.filter((row) => row.ok).length, JSON.stringify(rows)).toBeGreaterThanOrEqual(
      MIN_OK,
    );
  });
});
