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
/** The hips `lift`° over the shoulders, the thighs following: the shoulder–hip–knee line reads 135 + 2 × `lift`. */
const bridge = (lift: number) => onBack({ thigh: 45 - lift, shin: 45, lean: -lift });

describe('glute bridge', () => {
  it('counts lifting the hips and lowering them', () => {
    expect(play([down, bridge(21), down])).toMatchObject({
      reps: 1,
      noReps: 0,
      lastRep: { counted: true, depth: expect.closeTo(177, 0), cues: [] },
    });
  });

  it('calls a half lift a failed rep', () => {
    expect(play([down, bridge(14), down])).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: ['Lift your hips higher'] },
    });
  });

  it('refuses a bridge on straight legs', () => {
    expect(play([down, onBack({ lean: -10 }), down])).toMatchObject({
      reps: 0,
      lastRep: { cues: ['Keep your knees bent'] },
    });
  });
});

// Labelled from their video: phone on the floor side-on, gravity on.
const CLIPS: Record<string, { reps: number; noReps: number }> = {
  // Walks in and lies back (nothing), 6 bridges; the clip ends as the 6th lands.
  'glute-bridge-1794176003571': { reps: 6, noReps: 0 },
  // 6 bridges, a half lift (fails), a slight lift (nothing), one twisted at the hips (counts: side-on
  // it is as straight).
  'glute-bridge-1794176040797': { reps: 7, noReps: 1 },
  // 21 full bridges, the phone closer. The hips' rise over the shoulders read 13–22° here, and 13 of
  // them were refused while that was the measure.
  'glute-bridge-1794615900000': { reps: 21, noReps: 0 },
};
const clips = Object.entries(CLIPS).map(([clip, expected]) => ({
  clip,
  expected,
  path: traceFiles('device').find((p) => p.endsWith(`${clip}.sht`)),
}));
describe.skipIf(clips.some((c) => !c.path))('glute bridge on device clips with gravity', () => {
  it.each(clips)('$clip', ({ path, expected }) => {
    assert(path);
    expect(replay(gluteBridge, loadTrace(path))).toMatchObject(expected);
  });
});
