import { assert, describe, expect, it } from 'vite-plus/test';

import { plank } from './plank';
import { measurePlank, type PlankSample } from './positions/plank';
import type { HoldState } from '@/exercises/kinds/hold';
import type { Pose } from '@/exercises/body/geometry';
import { plank as pose } from './__fixtures__/plank';
import { loadTrace, toPose, traceFiles } from './__fixtures__/replay';

const FRAME = 66;
const play = (body: Pose | null, from: number, to: number, state = plank.initial): HoldState => {
  for (let t = from; t <= to; t += FRAME) state = plank.step(state, body && measurePlank(body), t);
  return state;
};

describe('plank', () => {
  it('credits a 5 s hold', () => {
    const state = play(pose({}), 0, 5000);
    expect(state).toMatchObject({ phase: 'active', reps: 0, noReps: 0 });
    expect(state.heldMs).toBeGreaterThanOrEqual(4600);
    expect(state.heldMs).toBeLessThanOrEqual(5000);
  });

  it('pauses with the body cue, without breaking, after sagging 40 degrees for 1 s', () => {
    const held = play(pose({}), 0, 4950);
    expect(play(pose({ sag: 40 }), 5016, 6006, held)).toMatchObject({
      phase: 'active',
      noReps: 1,
      broken: false,
      heldMs: 4950,
      lastRep: { cues: ['Keep your body straight'] },
    });
  });

  it('never enters while kneeling', () => {
    expect(play(pose({ kneeling: true }), 0, 5000)).toMatchObject({
      phase: 'waiting',
      heldMs: 0,
      noReps: 0,
    });
  });

  it('breaks after dropping to the knees', () => {
    const held = play(pose({}), 0, 4950);
    expect(play(pose({ kneeling: true }), 5016, 6006, held)).toMatchObject({
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

  it.each<[Partial<PlankSample>, string]>([
    [{ reach: 160, knee: 0.3, kneeHeight: 0, drop: 0.9 }, 'Get into a plank'],
    [{ knee: 0.3, kneeHeight: 0, drop: 0.9 }, 'Knees off the floor'],
    [{ drop: 0.9 }, 'Keep your body straight'],
    [{ drop: -0.9 }, 'Keep your body straight'],
  ])('says the first failing check: %o → %s', (change, cue) => {
    const sample = measurePlank(pose({}));
    assert(sample);
    let state = play(pose({}), 0, 4950);
    for (let t = 5016; t <= 6006; t += FRAME)
      state = plank.step(state, { ...sample, ...change }, t);
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

// Device clips with gravity (front camera), labelled from their video in clip seconds. 'plank' must
// earn the clock; the rest must not. A sag or pike pauses (the hold stays active), kneeling breaks it,
// and a slump (a sag entered straight from standing) never starts it.
type Moment = 'plank' | 'sag' | 'pike' | 'kneel' | 'lying' | 'slump';
const LABELS: Record<string, [Moment, from: number, to: number][]> = {
  'plank-1794160423565.sht': [
    ['plank', 7.6, 11.5],
    ['sag', 12.3, 18.9],
  ],
  'plank-1794160461086.sht': [
    ['slump', 14, 17.9],
    ['kneel', 18.4, 26.6],
  ],
  // Facing the other way.
  'plank-1794161278862.sht': [
    ['plank', 11.7, 16.4],
    ['sag', 17.4, 20.5],
    ['kneel', 23.5, 26.6],
    ['plank', 27.6, 28.9],
  ],
  // On a side, legs straight.
  'plank-1794161362681.sht': [['lying', 16.9, 20.2]],
  // Forearm planks too; lying flat, on the forearms and on the hands.
  'plank-1794161854197.sht': [
    ['kneel', 11, 12.9],
    ['plank', 13, 17],
    ['sag', 18, 21],
    ['lying', 38, 42],
    ['plank', 43, 44.5],
    ['plank', 48, 51.5],
    ['lying', 52, 56],
    ['plank', 57, 62],
    ['sag', 63, 69.5],
    ['pike', 70, 73.5],
  ],
  // A clean hold, start to end.
  'plank-1794164326303.sht': [['plank', 7.2, 16.4]],
  // The far knee down, then the near one.
  'plank-1794169464742.sht': [
    ['plank', 8.4, 10.5],
    ['kneel', 11.2, 17.8],
  ],
  // One knee down, a plank, both knees, one knee.
  'plank-1794169490623.sht': [
    ['kneel', 4.8, 8.3],
    ['plank', 9, 11.3],
    ['kneel', 12.2, 15],
    ['kneel', 15.4, 17.4],
  ],
  // Pikes of three sizes between planks: the middle one read −0.10 in the picture, and passed as a
  // plank while the body line was the detector's world guess.
  'plank-1794609300000.sht': [
    ['plank', 11.6, 13.2],
    ['pike', 14.4, 16.4],
    ['pike', 16.9, 18.6],
    ['pike', 19.2, 22.8],
    ['plank', 28.4, 30.6],
    ['plank', 34.6, 36.4],
    ['pike', 37, 39.9],
  ],
  // Hips on the floor on straight arms, then sitting and lying on a side.
  'plank-1794169524975.sht': [
    ['lying', 4.5, 9.8],
    ['plank', 10.5, 13.6],
    ['lying', 14.5, 22],
    ['plank', 23, 26.9],
  ],
};
const labelled = Object.keys(LABELS).map((clip) =>
  traceFiles('device').find((p) => p.endsWith(clip)),
);
describe.skipIf(labelled.some((path) => !path))('plank on device clips with gravity', () => {
  /** The hold at each frame time, in ms. */
  const states = (path: string) => {
    let state = plank.initial;
    const { frames, header } = loadTrace(path);
    return frames.map((frame) => {
      state = plank.step(state, plank.measure(toPose(frame, header)), frame.t);
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
      const { phase } = at(run, to);
      // A plank earns most of its span; anything else at most the grace before a slip counts.
      const clock = moment === 'plank' ? earned >= 0.7 * (to - from) * 1000 : earned <= 1000;
      // A sag or a pike pauses the hold, it never breaks it.
      const paused = moment === 'sag' || moment === 'pike';
      const out = moment === 'kneel' || moment === 'slump';
      const ok = clock && (paused ? phase === 'active' : !out || phase === 'waiting');
      return { moment, from, earned, ok };
    });
    expect(
      rows.filter((row) => !row.ok),
      JSON.stringify(rows),
    ).toEqual([]);
  });
});
