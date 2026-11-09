import { assert, describe, expect, it } from 'vite-plus/test';

import { body } from './__fixtures__/body';
import { loadTrace, toPose, traceFiles } from './__fixtures__/replay';
import type { Pose } from '@/exercises/body/geometry';
import type { HoldState } from '@/exercises/kinds/hold';
import { wallSit } from './wall-sit';

const seated = body({ thigh: 90 });
const FRAME = 66;
/** Each pose held for its ms, in order, as the clock sees it. */
const play = (...steps: [Pose, number][]): HoldState => {
  let state = wallSit.initial;
  let t = 0;
  for (const [pose, ms] of steps)
    for (const end = t + ms; t < end;) {
      t += FRAME;
      state = wallSit.step(state, wallSit.measure(pose), t);
    }
  return state;
};

describe('wall sit', () => {
  it('times a held wall sit', () => {
    const s = play([seated, 2000]);
    expect(s).toMatchObject({ phase: 'active', noReps: 0 });
    expect(s.heldMs).toBeGreaterThan(1800);
  });

  it('stops the clock while the hips slide up, and breaks the hold on standing up or sitting down', () => {
    const slid = play([seated, 2000], [body({ thigh: 50 }), 2000]);
    expect(slid).toMatchObject({
      phase: 'active',
      noReps: 1,
      cue: 'Slide down until your thighs are level',
    });
    expect(slid.heldMs).toBeLessThan(2100);
    for (const out of [body({}), body({ thigh: 150, shin: 30 })])
      expect(play([seated, 2000], [out, 2000])).toMatchObject({ phase: 'waiting', broken: true });
  });
});

type Moment = 'sit' | 'half' | 'stand' | 'sink' | 'lean' | 'crouch' | 'walk';
// Device clips with gravity, labelled from their video, in seconds of the trace. The back-camera clips
// were recorded before the back camera's gravity z was fixed; their z is negated to match.
const LABELS: Record<string, [Moment, number, number][]> = {
  // Front camera on a diagonal: sits between half standing, standing, sinking to the floor, leaning
  // forward, a high sit with the arms out, and crouching low against the wall.
  'wall-sit-1794179673917.sht': [
    ['sit', 6, 9],
    ['half', 10, 13.5],
    ['sit', 14.5, 17.5],
    ['stand', 19, 22],
    ['sink', 23.7, 28],
    ['lean', 29.3, 30.2],
    ['half', 30.6, 32.3],
    ['sit', 32.6, 38],
    ['stand', 39.5, 42.5],
    ['crouch', 43.5, 48],
  ],
  // Back camera side-on; the video covers the end only.
  'wall-sit-1794179812467.sht': [
    ['sit', 27, 29.5],
    ['walk', 30.5, 33],
  ],
  // Back camera side-on: one long sit, then standing.
  'wall-sit-1794179873948.sht': [
    ['sit', 12, 36],
    ['stand', 38.3, 39.3],
  ],
};
const labelled = Object.keys(LABELS).map((clip) =>
  traceFiles('device').find((p) => p.endsWith(clip)),
);
describe.skipIf(labelled.some((path) => !path))('wall sit on device clips with gravity', () => {
  /** The hold at each frame time, in ms. */
  const states = (path: string) => {
    let state = wallSit.initial;
    return loadTrace(path).frames.map((frame) => {
      const pose = frame.landmarks.length ? toPose(frame) : null;
      state = wallSit.step(state, pose && wallSit.measure(pose), frame.t);
      return [frame.t, state] as const;
    });
  };
  const at = (run: ReturnType<typeof states>, s: number) =>
    run.findLast(([t]) => t <= s * 1000)?.[1] ?? wallSit.initial;

  it.each(Object.entries(LABELS))('%s: the clock runs only in a wall sit', (clip, moments) => {
    const path = labelled.find((p) => p?.endsWith(clip));
    assert(path);
    const run = states(path);
    const rows = moments.map(([moment, from, to]) => {
      const earned = at(run, to).heldMs - at(run, from).heldMs;
      // A sit earns most of its span; anything else at most the grace before a slip counts.
      const ok = moment === 'sit' ? earned >= 0.7 * (to - from) * 1000 : earned <= 1000;
      return { moment, from, earned, ok };
    });
    expect(
      rows.filter((row) => !row.ok),
      JSON.stringify(rows),
    ).toEqual([]);
  });
});
