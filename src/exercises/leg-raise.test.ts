import { assert, describe, expect, it } from 'vite-plus/test';
import { SIDE } from 'reprepgo-pose/joints';

import type { Pose } from '@/exercises/body/geometry';
import { onBack } from './__fixtures__/body';
import { loadTrace, replay, traceFiles } from './__fixtures__/replay';
import { legRaise } from './leg-raise';

const FRAME = 66;
/** Each pose held for 2 s, as the counter sees it. */
const play = (poses: Pose[]) =>
  poses.reduce((state, pose, i) => {
    for (let t = i * 2000; t < (i + 1) * 2000; t += FRAME)
      state = legRaise.step(state, legRaise.measure(pose), t);
    return state;
  }, legRaise.initial);

const flat = onBack({});
const raised = onBack({ thigh: 85, shin: -85 });

describe('leg raise', () => {
  it('counts raising straight legs to vertical and lowering them', () => {
    expect(play([flat, raised, flat])).toMatchObject({
      reps: 1,
      noReps: 0,
      lastRep: { counted: true, depth: expect.closeTo(95, 0), cues: [] },
    });
  });

  it('refuses tucked knees and a V-up', () => {
    expect(play([flat, onBack({ thigh: 85 }), flat])).toMatchObject({
      reps: 0,
      lastRep: { cues: ['Keep your legs straight'] },
    });
    expect(play([flat, onBack({ thigh: 85, shin: -85, lean: 30 }), flat])).toMatchObject({
      reps: 0,
      lastRep: { cues: ['Keep your back on the floor'] },
    });
  });

  it('counts nothing for one leg raised alone', () => {
    const one = onBack({ thigh: 85, shin: -85 });
    for (const j of ['hip', 'knee', 'ankle'] as const)
      one.worldLandmarks[SIDE.right[j]] = flat.worldLandmarks[SIDE.right[j]];
    expect(play([flat, one, flat])).toMatchObject({ reps: 0, noReps: 0 });
  });
});

// Labelled from its video: phone on the floor side-on, gravity on.
const CLIPS: Record<string, { reps: number; noReps: number }> = {
  // 9 raises, one held at the top; one leg alone 4 times (nothing), half raises (nothing), 2 V-ups,
  // a raise into sitting up and a tuck (all fail), and getting up at the end bent-kneed (fails).
  'leg-raise-1794176280181': { reps: 9, noReps: 5 },
};
const clips = Object.entries(CLIPS).map(([clip, expected]) => ({
  clip,
  expected,
  path: traceFiles('device').find((p) => p.endsWith(`${clip}.sht`)),
}));
describe.skipIf(clips.some((c) => !c.path))('leg raise on device clips with gravity', () => {
  it.each(clips)('$clip', ({ path, expected }) => {
    assert(path);
    expect(replay(legRaise, loadTrace(path))).toMatchObject(expected);
  });
});
