import { describe, expect, it } from 'vite-plus/test';

import { body } from './__fixtures__/body';
import { plank } from './__fixtures__/plank';
import { clipSuite } from './__fixtures__/replay';
import type { Pose } from '@/exercises/body/geometry';
import type { SequenceState } from '@/exercises/kinds/sequence';
import { burpee } from './burpee';

const standing = plank({ standing: true });
const down = plank({});
// Thighs level, shins upright: on the feet but not standing tall, and no plank.
const crouch = body({ thigh: 90 });
const FRAME = 66;
/** Each pose held for its ms, in order. */
const play = (...steps: [Pose, number][]): SequenceState => {
  let state = burpee.initial;
  let t = 0;
  for (const [pose, ms] of steps)
    for (const end = t + ms; t < end;) {
      t += FRAME;
      state = burpee.step(state, burpee.measure(pose), t);
    }
  return state;
};

describe('burpee', () => {
  it('reads which position the body is in', () => {
    expect(burpee.measure(standing)?.at).toBe(0);
    expect(burpee.measure(down)?.at).toBe(1);
    expect(burpee.measure(crouch)?.at).toBeNull();
    // Hands down, hips high: a pike, not a plank.
    expect(burpee.measure(plank({ sag: -60 }))?.at).toBeNull();
    expect(burpee.measure({ ...standing, down: undefined })).toBeNull();
  });

  it('counts standing, the plank and back up; squatting down and up is not a rep', () => {
    const rep = play([standing, 1000], [crouch, 500], [down, 1000], [crouch, 500], [standing, 500]);
    expect(rep).toMatchObject({ reps: 1, noReps: 0 });
    expect(play([standing, 1000], [crouch, 500], [standing, 500])).toMatchObject({
      reps: 0,
      noReps: 0,
    });
  });

  it('misses the rep when the plank lasts too long, with the cue to stand', () => {
    expect(play([standing, 1000], [down, 4000])).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, cues: ['Stand tall'] },
    });
  });
});

// Device clips with gravity, side-on with the phone upright, labelled from their video in trace seconds:
// each span holds one real burpee, and no rep counts outside them.
const BURPEES: Record<string, [number, number][]> = {
  // Four burpees; then down to a plank and lying flat, sitting up, and crawling onto all fours.
  'burpee-1794183187017.sht': [
    [32.4, 35.2],
    [39.5, 42.1],
    [44, 46.8],
    [49.5, 52.2],
  ],
  // Cheats only: hands down and back up, walking out onto all fours, crouching, sitting down.
  'burpee-1794183259841.sht': [],
  // Two quick burpees; then hands down and up, folds, and three kicked back into a plank that sank to
  // the floor before standing.
  'burpee-1794184001925.sht': [
    [6.5, 9.2],
    [16.5, 19.2],
  ],
};
clipSuite('burpee', burpee, BURPEES);
