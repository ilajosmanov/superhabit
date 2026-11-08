import { assert, describe, expect, it } from 'vite-plus/test';

import { plank } from './plank';
import { measurePlank } from './positions/plank';
import type { HoldState } from '@/exercises/kinds/hold';
import type { Pose } from '@/exercises/body/geometry';
import { plank as pose } from './__fixtures__/plank';
import { loadTrace, replay, scoreHold, traceFiles } from './__fixtures__/replay';

const FRAME = 66;
const play = (body: Pose | null, from: number, to: number, state = plank.initial): HoldState => {
  for (let t = from; t <= to; t += FRAME) state = plank.step(state, body && measurePlank(body), t);
  return state;
};

describe('plank', () => {
  it.each([false, true])('credits a 5 s hold with forearms=%s', (forearms) => {
    const state = play(pose({ forearms }), 0, 5000);
    expect(state).toMatchObject({ phase: 'active', reps: 0, noReps: 0 });
    expect(state.heldMs).toBeGreaterThanOrEqual(4600);
    expect(state.heldMs).toBeLessThanOrEqual(5000);
  });

  it.each([false, true])(
    'pauses with the body cue, without breaking, after sagging 40 degrees for 1 s with forearms=%s',
    (forearms) => {
      const held = play(pose({ forearms }), 0, 4950);
      const sagging = play(pose({ forearms, sag: 40 }), 5016, 6006, held);
      expect(sagging).toMatchObject({
        phase: 'active',
        noReps: 1,
        broken: false,
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
      phase: 'active',
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
  // By name, so one clip getting worse can't hide behind another getting better.
  it('holds for enough of every clip but the two known misses', () => {
    const rows = scoreHold(plank, files, 0.7, 1500);
    expect(
      rows.filter((row) => !row.ok).map((row) => row.clip),
      JSON.stringify(rows),
    ).toEqual(['plank/plank_2.mp4', 'plank/plank_6.mp4']);
  });

  it('credits no squat clip with a 10 s plank', () => {
    const held = traceFiles('squat').map((path) => replay(plank, loadTrace(path)).heldMs);
    expect(Math.max(...held)).toBeLessThan(10_000);
  });
  // shortcut: a push-up's top position is a plank, so push-up clips earn 8-44 s of plank time;
  // add a 'no elbow cycling' gate if mixed sessions show it on device.
});
