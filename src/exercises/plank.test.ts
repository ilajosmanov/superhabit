import { assert, describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { plank, measurePlank } from './plank';
import type { HoldState } from '@/exercises/kinds/hold';
import type { Pose } from '@/exercises/body/geometry';
import { plank as pose } from './__fixtures__/plank';
import { loadTrace, replay, scoreHold, traceFiles } from './__fixtures__/replay';

const FRAME = 66;
const play = (body: Pose | null, from: number, to: number, state = plank.initial): HoldState => {
  for (let t = from; t <= to; t += FRAME) state = plank.step(state, body && measurePlank(body), t);
  return state;
};

describe('measurePlank', () => {
  it.each([false, true])('reads a straight body and knees with forearms=%s', (forearms) => {
    const sample = measurePlank(pose({ forearms }));
    assert(sample);
    expect(sample.body).toBeCloseTo(180);
    expect(sample.knees).toBeCloseTo(180);
    expect(sample.reach).toBeGreaterThanOrEqual(50);
    expect(sample.reach).toBeLessThanOrEqual(120);
  });

  it('uses the better-seen side and reports the body-line joints', () => {
    expect(measurePlank(pose({ visible: 'right', sag: 40 }))).toMatchObject({
      body: expect.closeTo(140),
      joints: [Joint.RIGHT_SHOULDER, Joint.RIGHT_HIP, Joint.RIGHT_ANKLE],
    });
  });

  it('uses the other side when the near knee is hidden', () => {
    const body = pose({ visible: 'both' });
    body.landmarks[Joint.LEFT_KNEE].visibility = 0.05;
    expect(measurePlank(body)?.joints).toEqual([
      Joint.RIGHT_SHOULDER,
      Joint.RIGHT_HIP,
      Joint.RIGHT_ANKLE,
    ]);
  });

  it('prefers the clear far side over a barely visible near ankle', () => {
    const body = pose({ visible: 'both' });
    body.landmarks[Joint.LEFT_ANKLE].visibility = 0.11;
    for (const joint of [
      Joint.RIGHT_SHOULDER,
      Joint.RIGHT_ELBOW,
      Joint.RIGHT_WRIST,
      Joint.RIGHT_HIP,
      Joint.RIGHT_KNEE,
      Joint.RIGHT_ANKLE,
    ])
      body.landmarks[joint].visibility = 0.8;
    expect(measurePlank(body)?.joints).toEqual([
      Joint.RIGHT_SHOULDER,
      Joint.RIGHT_HIP,
      Joint.RIGHT_ANKLE,
    ]);
  });

  it('rejects a cropped wrist even with the tuned visibility threshold', () => {
    const body = pose({});
    body.landmarks[Joint.LEFT_WRIST].x = 1.1;
    body.landmarks[Joint.RIGHT_WRIST].x = 1.1;
    expect(measurePlank(body)).toBeNull();
  });

  it.each(['x', 'y', 'visibility'] as const)('rejects ankles with invalid %s', (field) => {
    const body = pose({});
    for (const ankle of [Joint.LEFT_ANKLE, Joint.RIGHT_ANKLE])
      body.landmarks[ankle][field] = field === 'visibility' ? 0.05 : 1.1;
    expect(measurePlank(body)).toBeNull();
    expect(play(body, 0, 5000)).toMatchObject({ phase: 'waiting', heldMs: 0 });
  });

  it.each(['x', 'visibility'] as const)(
    'chooses the other side when the near ankle has invalid %s',
    (field) => {
      const body = pose({ visible: 'both' });
      body.landmarks[Joint.LEFT_ANKLE][field] = field === 'visibility' ? 0.05 : 1.1;
      expect(measurePlank(body)?.joints).toEqual([
        Joint.RIGHT_SHOULDER,
        Joint.RIGHT_HIP,
        Joint.RIGHT_ANKLE,
      ]);
      expect(play(body, 0, 5000).heldMs).toBeGreaterThanOrEqual(4600);
    },
  );

  it('rejects coincident joints instead of passing an invalid angle to the hold', () => {
    const body = pose({});
    body.worldLandmarks[Joint.LEFT_KNEE] = body.worldLandmarks[Joint.LEFT_HIP];
    expect(measurePlank(body)).toBeNull();
  });
});

describe('plank', () => {
  it.each([false, true])('credits a 5 s hold with forearms=%s', (forearms) => {
    const state = play(pose({ forearms }), 0, 5000);
    expect(state).toMatchObject({ phase: 'active', reps: 0, noReps: 0 });
    expect(state.heldMs).toBeGreaterThanOrEqual(4600);
    expect(state.heldMs).toBeLessThanOrEqual(5000);
  });

  it.each([false, true])(
    'breaks with the body cue after sagging 40 degrees for 1 s with forearms=%s',
    (forearms) => {
      const held = play(pose({ forearms }), 0, 4950);
      const broken = play(pose({ forearms, sag: 40 }), 5016, 6006, held);
      expect(broken).toMatchObject({
        phase: 'waiting',
        noReps: 1,
        broken: true,
        heldMs: 4950,
        lastRep: { cues: ['Keep your body straight'] },
      });
    },
  );

  it.each([false, true])('checks form in a rotated world with forearms=%s', (forearms) => {
    const rotate = (body: Pose): Pose => ({
      ...body,
      worldLandmarks: body.worldLandmarks.map(({ x, y, z, visibility }) => ({
        x: -y,
        y: z,
        z: x,
        visibility,
      })),
    });
    const held = play(rotate(pose({ forearms })), 0, 4950);
    expect(held).toMatchObject({ phase: 'active', heldMs: 4950 });
    expect(play(rotate(pose({ forearms, kneeling: true })), 0, 5000)).toMatchObject({
      phase: 'waiting',
      heldMs: 0,
    });
    expect(play(rotate(pose({ forearms, sag: 40 })), 5016, 6006, held)).toMatchObject({
      phase: 'waiting',
      heldMs: 4950,
      noReps: 1,
      lastRep: { cues: ['Keep your body straight'] },
    });
  });

  it.each([false, true])('never enters while kneeling with forearms=%s', (forearms) => {
    expect(play(pose({ kneeling: true, forearms }), 0, 5000)).toMatchObject({
      phase: 'waiting',
      heldMs: 0,
      noReps: 0,
    });
  });

  it.each([false, true])('breaks after dropping to the knees with forearms=%s', (forearms) => {
    const held = play(pose({ forearms }), 0, 4950);
    expect(play(pose({ kneeling: true, forearms }), 5016, 6006, held)).toMatchObject({
      phase: 'waiting',
      heldMs: 4950,
      noReps: 1,
      lastRep: { cues: ['Knees off the floor'] },
    });
  });

  it('never enters while standing', () => {
    expect(play(pose({ standing: true }), 0, 5000)).toMatchObject({
      phase: 'waiting',
      heldMs: 0,
      noReps: 0,
    });
  });

  it('breaks with the setup cue when reach exceeds 155 degrees', () => {
    const sample = measurePlank(pose({}));
    assert(sample);
    let state = play(pose({}), 0, 4950);
    for (let t = 5016; t <= 6006; t += FRAME)
      state = plank.step(state, { ...sample, reach: 160 }, t);
    expect(state).toMatchObject({
      phase: 'waiting',
      heldMs: 4950,
      noReps: 1,
      broken: true,
      lastRep: { cues: ['Get into a plank'] },
    });
  });

  it.each([
    { reach: 20, knees: 90, body: 90, cue: 'Get into a plank' },
    { reach: 90, knees: 90, body: 90, cue: 'Knees off the floor' },
    { reach: 90, knees: 180, body: 130, cue: 'Keep your body straight' },
  ])('prioritises "$cue" when several form checks fail', ({ reach, knees, body, cue }) => {
    const sample = measurePlank(pose({}));
    assert(sample);
    let state = play(pose({}), 0, 4950);
    for (let t = 5016; t <= 6006; t += FRAME)
      state = plank.step(state, { ...sample, reach, knees, body }, t);
    expect(state).toMatchObject({ noReps: 1, lastRep: { cues: [cue] } });
  });

  it('uses the plank tracking-loss cue after a 1 s dropout', () => {
    const held = play(pose({}), 0, 4950);
    expect(play(null, 5016, 6006, held)).toMatchObject({
      noReps: 1,
      heldMs: 4950,
      lastRep: { cues: ['Back into your plank'] },
    });
  });

  it('shows held seconds and singular or plural breaks', () => {
    const held = play(pose({}), 0, 4950);
    expect(plank.stats(held)).toBe('HELD 5.0s · 0 BREAKS');
    const broken = play(pose({ sag: 40 }), 5016, 6006, held);
    expect(plank.stats(broken)).toBe('HELD 5.0s · 1 BREAK');
  });
});

const files = traceFiles('plank');
describe.skipIf(files.length === 0)('plank on real traces', () => {
  it('holds for enough of at least 7 clips', () => {
    const rows = scoreHold(plank, files, 0.7, 1500);
    expect(rows.filter((row) => row.ok).length, JSON.stringify(rows)).toBeGreaterThanOrEqual(7);
  });

  it('credits no squat clip with a 10 s plank', () => {
    const held = traceFiles('squat').map((path) => replay(plank, loadTrace(path)).heldMs);
    expect(Math.max(...held)).toBeLessThan(10_000);
  });
  // shortcut: a push-up's top position is a plank, so push-up clips earn 8-44 s of plank time;
  // add a 'no elbow cycling' gate if mixed sessions show it on device.
});
