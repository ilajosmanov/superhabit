import { assert, describe, expect, it } from 'vite-plus/test';

import type { Pose } from '@/exercises/body/geometry';
import { onBack } from './__fixtures__/body';
import { loadTrace, replay, traceFiles } from './__fixtures__/replay';
import { situp } from './situp';

const FRAME = 66;
/** Each pose held for 2 s, as the counter sees it. */
const play = (poses: Pose[]) =>
  poses.reduce((state, pose, i) => {
    for (let t = i * 2000; t < (i + 1) * 2000; t += FRAME)
      state = situp.step(state, situp.measure(pose), t);
    return state;
  }, situp.initial);

const lying = onBack({ thigh: 45, shin: 45 });
const up = onBack({ thigh: 45, shin: 45, lean: 70 });

describe('situp', () => {
  it('counts lying back, sitting up and lying back', () => {
    expect(play([lying, up, lying])).toMatchObject({
      reps: 1,
      noReps: 0,
      lastRep: { counted: true, depth: expect.closeTo(68, 0), cues: [] },
    });
  });

  it('calls a crunch a failed rep', () => {
    expect(play([lying, onBack({ thigh: 45, shin: 45, lean: 38 }), lying])).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: ['Sit up higher'] },
    });
  });

  it('refuses sitting up on the hands', () => {
    expect(play([lying, onBack({ thigh: 45, shin: 45, lean: 70 }, 'floor'), lying])).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: ['Hands behind your head'] },
    });
  });

  it('waits for you to lie back: starting sat up counts nothing', () => {
    expect(play([up, lying])).toMatchObject({ reps: 0, noReps: 0, phase: 'up' });
  });
});

// Labelled from their video: phone on the floor side-on, gravity on.
const CLIPS: Record<string, { reps: number; noReps: number }> = {
  // Sits on the hands to set up (nothing), then 4 sit-ups; a 5th is cut off at its top.
  'situp-1794175829092': { reps: 4, noReps: 0 },
  // Crunches to 24°, 38° and 40° (the last two fail), 2 sit-ups (one swinging the arms forward),
  // then 2 sat up pulling on the shins (both fail).
  'situp-1794175878545': { reps: 2, noReps: 4 },
};
const clips = Object.entries(CLIPS).map(([clip, expected]) => ({
  clip,
  expected,
  path: traceFiles('device').find((p) => p.endsWith(`${clip}.json`)),
}));
describe.skipIf(clips.some((c) => !c.path))('situp on device clips with gravity', () => {
  it.each(clips)('$clip', ({ path, expected }) => {
    assert(path);
    expect(replay(situp, loadTrace(path))).toMatchObject(expected);
  });
});
