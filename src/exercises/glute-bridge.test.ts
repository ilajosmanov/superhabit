import { assert, describe, expect, it } from 'vite-plus/test';

import type { Pose } from '@/exercises/body/geometry';
import { onBack } from './__fixtures__/body';
import { loadTrace, replay, traceFiles } from './__fixtures__/replay';
import { gluteBridge } from './glute-bridge';

const FRAME = 66;
/** Each pose held for 2 s, as the counter sees it. */
const play = (poses: Pose[]) =>
  poses.reduce((state, pose, i) => {
    for (let t = i * 2000; t < (i + 1) * 2000; t += FRAME)
      state = gluteBridge.step(state, gluteBridge.measure(pose), t);
    return state;
  }, gluteBridge.initial);

const down = onBack({ thigh: 45, shin: 45 });
/** The hips `lift`° over the shoulders, knees bent. */
const bridge = (lift: number) => onBack({ thigh: 45, shin: 45, lean: -lift });

describe('glute bridge', () => {
  it('counts lifting the hips and lowering them', () => {
    expect(play([down, bridge(25), down])).toMatchObject({
      reps: 1,
      noReps: 0,
      lastRep: { counted: true, depth: expect.closeTo(25, 0), cues: [] },
    });
  });

  it('calls a half lift a failed rep', () => {
    expect(play([down, bridge(10), down])).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: ['Lift your hips higher'] },
    });
  });

  it('refuses a bridge on straight legs', () => {
    expect(play([down, onBack({ lean: -25 }), down])).toMatchObject({
      reps: 0,
      lastRep: { cues: ['Keep your knees bent'] },
    });
  });
});

// Labelled from their video: phone on the floor side-on, gravity on.
const CLIPS: Record<string, { reps: number; noReps: number }> = {
  // Walks in and lies back (nothing), 5 bridges; a 6th is cut off at its top.
  'glute-bridge-1794176003571': { reps: 5, noReps: 0 },
  // 6 bridges, a half lift (fails), a slight lift (nothing), one twisted at the hips (fails at 16°).
  'glute-bridge-1794176040797': { reps: 6, noReps: 2 },
};
const clips = Object.entries(CLIPS).map(([clip, expected]) => ({
  clip,
  expected,
  path: traceFiles('device').find((p) => p.endsWith(`${clip}.json`)),
}));
describe.skipIf(clips.some((c) => !c.path))('glute bridge on device clips with gravity', () => {
  it.each(clips)('$clip', ({ path, expected }) => {
    assert(path);
    expect(replay(gluteBridge, loadTrace(path))).toMatchObject(expected);
  });
});
