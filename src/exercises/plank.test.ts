import { assert, describe, expect, it } from 'vite-plus/test';

import { plank } from './plank';
import { measurePlank } from './positions/plank';
import type { HoldState } from '@/exercises/kinds/hold';
import type { Pose } from '@/exercises/body/geometry';
import { plank as pose } from './__fixtures__/plank';
import { loadTrace, replay, scoreHold, traceFiles } from './__fixtures__/replay';
import { toPose } from '@/exercises/body/trace';

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
    { reach: 20, knees: 90, lift: 0.1, body: 90, cue: 'Get into a plank' },
    { reach: 90, knees: 90, lift: 0.1, body: 90, cue: 'Knees off the floor' },
    { reach: 90, knees: 180, lift: 0.7, body: 130, cue: 'Keep your body straight' },
  ])('prioritises "$cue" when several form checks fail', ({ reach, knees, lift, body, cue }) => {
    const sample = measurePlank(pose({}));
    assert(sample);
    let state = play(pose({}), 0, 4950);
    for (let t = 5016; t <= 6006; t += FRAME)
      state = plank.step(state, { ...sample, reach, knees, lift, body }, t);
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
  it('holds for enough of every clip but the known miss', () => {
    const rows = scoreHold(plank, files, 0.7, 1500);
    expect(
      rows.filter((row) => !row.ok).map((row) => row.clip),
      JSON.stringify(rows),
    ).toEqual(['plank/plank_6.mp4']);
  });

  it('credits no squat clip with a 10 s plank', () => {
    const held = traceFiles('squat').map((path) => replay(plank, loadTrace(path)).heldMs);
    expect(Math.max(...held)).toBeLessThan(10_000);
  });
  // shortcut: a push-up's top position is a plank, so push-up clips earn 8-44 s of plank time;
  // add a 'no elbow cycling' gate if mixed sessions show it on device.
});

// Device clips with gravity (front camera), labelled from their video in clip seconds. 'plank' must
// earn the clock; the rest must not. A sag pauses (the hold stays active), kneeling breaks it.
type Moment = 'plank' | 'sag' | 'kneel' | 'lying';
const LABELS: Record<string, [Moment, from: number, to: number][]> = {
  'plank-1794160423565.json': [
    ['plank', 7.6, 11.5],
    ['sag', 12.3, 18.9],
  ],
  'plank-1794160461086.json': [
    ['sag', 14, 17.9],
    ['kneel', 18.4, 26.6],
  ],
  // Facing the other way.
  'plank-1794161278862.json': [
    ['plank', 11.7, 16.4],
    ['sag', 17.4, 20.5],
    ['kneel', 23.5, 26.6],
    ['plank', 27.6, 28.9],
  ],
  // On a side, legs straight.
  'plank-1794161362681.json': [['lying', 16.9, 20.2]],
  // Forearm planks too; lying flat, on the forearms and on the hands.
  // A clean hold, start to end.
  'plank-1794164326303.json': [['plank', 7.2, 16.4]],
  'plank-1794161854197.json': [
    ['kneel', 11, 12.9],
    ['plank', 13, 17],
    ['sag', 18, 21],
    ['lying', 38, 42],
    ['plank', 43, 44.5],
    ['plank', 48, 51.5],
    ['lying', 52, 56],
    ['plank', 57, 62],
    ['sag', 63, 69.5],
  ],
};
const labelled = Object.keys(LABELS).map((clip) =>
  traceFiles('device').find((p) => p.endsWith(clip)),
);
describe.skipIf(labelled.some((path) => !path))('plank on device clips with gravity', () => {
  /** The hold at each frame time, in ms. */
  const states = (path: string) => {
    let state = plank.initial;
    return loadTrace(path).frames.map((frame) => {
      state = plank.step(state, plank.measure(toPose(frame)), frame.t);
      return [frame.t, state] as const;
    });
  };
  const at = (run: ReturnType<typeof states>, s: number) =>
    run.findLast(([t]) => t <= s * 1000)?.[1] ?? plank.initial;

  it.each(Object.entries(LABELS))('%s: the clock runs only in a plank', (clip, moments) => {
    const path = labelled.find((p) => p?.endsWith(clip));
    assert(path);
    const run = states(path);
    const rows = moments.map(([moment, from, to]) => {
      const earned = at(run, to).heldMs - at(run, from).heldMs;
      const end = at(run, to);
      // A plank earns most of its span; anything else at most the grace before a slip counts.
      const clock = moment === 'plank' ? earned >= 0.7 * (to - from) * 1000 : earned <= 1000;
      const phase =
        moment === 'sag'
          ? end.phase === 'active'
          : moment === 'kneel'
            ? end.phase === 'waiting'
            : true;
      return { moment, from, earned, ok: clock && phase };
    });
    expect(
      rows.filter((row) => !row.ok),
      JSON.stringify(rows),
    ).toEqual([]);
  });
});
