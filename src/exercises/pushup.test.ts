import { describe, expect, it } from 'vite-plus/test';
import { Joint } from 'reprepgo-pose/joints';

import { pushup } from './pushup';
import type { Pose } from '@/exercises/body/geometry';
import { plank } from './__fixtures__/plank';
import { scoreReps, traceFiles } from './__fixtures__/replay';

const FRAME = 66; // ms between detector results
// [pose, fromMs, toMs]: hold a pose long enough for the smoothing filter to settle.
const play = (spans: [Pose | null, from: number, to?: number][], start = pushup.initial) =>
  spans.reduce<typeof pushup.initial>((state, [pose, from, to = from]) => {
    for (let t = from; t <= to; t += FRAME)
      state = pushup.step(state, pose && pushup.measure(pose), t);
    return state;
  }, start);
// The camera loses the near ankle (low on the floor, or past the frame edge).
const heelsOut = (pose: Pose): Pose => {
  pose.landmarks[Joint.LEFT_ANKLE] = { ...pose.landmarks[Joint.LEFT_ANKLE], visibility: 0.2 };
  return pose;
};
// Top, bottom, top, 1.5 s each.
const cycle = (top: Pose, bottom: Pose) =>
  play([
    [top, 0, 1500],
    [bottom, 1566, 3000],
    [top, 3066, 4500],
  ]);

describe('pushup.measure', () => {
  it('reads the other arm when the plank side has an elbow too faint to measure', () => {
    // The plank reads its left side (0.3 vs 0.2), but that wrist is below the elbow's bar; the right
    // leg is too faint to read the plank there, yet its arm is clear.
    const pose = plank({ visible: 'both' });
    pose.landmarks[Joint.LEFT_WRIST].visibility = 0.3;
    pose.landmarks[Joint.RIGHT_KNEE].visibility = 0.05;
    expect(pushup.measure(pose)).toMatchObject({
      at: { side: 'left' },
      joints: [Joint.RIGHT_SHOULDER, Joint.RIGHT_ELBOW, Joint.RIGHT_WRIST],
    });
  });
});

describe('pushup.step', () => {
  it('waits for a plank top before counting', () => {
    expect(play([[plank({ elbow: 80 }), 0, 1500]])).toMatchObject({ phase: 'waiting' });
    const fromBottom = play([
      [plank({ elbow: 80 }), 0, 1500],
      [plank({ elbow: 170 }), 1566, 3000],
    ]);
    expect(fromBottom).toMatchObject({ reps: 0, noReps: 0, phase: 'up' });
  });

  it('counts with the heels out of view, at the bottom or throughout', () => {
    const top = plank({ elbow: 170 });
    expect(cycle(top, heelsOut(plank({ elbow: 80 })))).toMatchObject({ reps: 1, noReps: 0 });
    expect(cycle(heelsOut(top), heelsOut(plank({ elbow: 80 })))).toMatchObject({ reps: 1 });
  });

  it('never counts knee push-ups, heels in view or not', () => {
    const top = plank({ elbow: 170, kneeling: true });
    const bottom = plank({ elbow: 80, kneeling: true });
    expect(cycle(top, bottom)).toMatchObject({ reps: 0, phase: 'waiting' });
    expect(cycle(heelsOut(top), heelsOut(bottom))).toMatchObject({ reps: 0, phase: 'waiting' });
  });

  it('turns a rep that sags on the way up into a no-rep', () => {
    const state = play([
      [plank({ elbow: 170 }), 0, 1500],
      [plank({ elbow: 80 }), 1566, 3000],
      [plank({ elbow: 170, sag: 40 }), 3066, 4500],
    ]);
    expect(state).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: ['Keep your body straight'] },
    });
  });

  it('turns a rep finished on the knees into a no-rep', () => {
    const state = play([
      [plank({ elbow: 170 }), 0, 1500],
      [plank({ elbow: 80 }), 1566, 3000],
      [plank({ elbow: 170, kneeling: true }), 3066, 4500],
    ]);
    expect(state).toMatchObject({ reps: 0, noReps: 1, lastRep: { cues: ['Knees off the floor'] } });
  });

  it('counts a full push-up once', () => {
    expect(cycle(plank({ elbow: 170 }), plank({ elbow: 80 }))).toMatchObject({
      reps: 1,
      noReps: 0,
      phase: 'up',
      lastRep: { counted: true, cues: [] },
    });
  });

  it('counts with the far arm hidden on either side', () => {
    const right = cycle(
      plank({ elbow: 170, visible: 'right' }),
      plank({ elbow: 80, visible: 'right' }),
    );
    expect(right.reps).toBe(1);
  });

  it('flags a half push-up as a no-rep', () => {
    expect(cycle(plank({ elbow: 170 }), plank({ elbow: 110 }))).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, cues: ['Go lower'] },
    });
  });

  it('never counts sagging hips', () => {
    expect(cycle(plank({ elbow: 170 }), plank({ elbow: 80, sag: 40 }))).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: ['Keep your body straight'] },
    });
    expect(cycle(plank({ elbow: 170, sag: 40 }), plank({ elbow: 80, sag: 40 }))).toMatchObject({
      reps: 0,
      phase: 'waiting',
    });
  });

  it('never arms while standing with the arms down', () => {
    expect(
      cycle(plank({ standing: true, elbow: 175 }), plank({ standing: true, elbow: 80 })),
    ).toMatchObject({ reps: 0, noReps: 0, phase: 'waiting' });
  });

  it('returns to waiting after a tracking gap', () => {
    const lost = play([
      [plank({ elbow: 170 }), 0, 1500],
      [plank({ elbow: 80 }), 1566, 2000],
      [null, 2500, 3500],
      [plank({ elbow: 80 }), 3566, 4500],
    ]);
    expect(lost.phase).toBe('waiting');
    expect(play([[plank({ elbow: 170 }), 4566, 6000]], lost)).toMatchObject({
      reps: 0,
      phase: 'up',
    });
  });
});

// Device clips with gravity, the newest three checked against their video. The phone counted fewer in
// most: it read the elbow from the world landmarks then.
// pushup-1794163715160: 7, from its video. pushup-1794164288747: 8, two of them behind a table leg.
// pushup-1794169596587: 5, as the phone counted.
// pushup-1794607860000: all 13 in its video, under long shorts that hide the knees; its press with
// the hips and knees down is not counted.
// pushup-1794609240000: its 9 clean ones and one lowered from the knees, none of its other cheats
// (lying at the bottom, a leg up, a knee push-up, from a sag).
// pushup-1794611100000: all 8 deep ones, two with the elbows wide; its two half reps read 110° and
// are refused.
// Other setups, each with its deep reps counted and its half reps (95–105°) refused:
// pushup-1794612060000 the phone upright, pushup-1794612120000 leaning as usual (its first two reps
// 0.6 s apart, the arms reaching 148° between them), pushup-1794612180000 the body turned about 35°
// to the lens.
// pushup-1794614760000: two, then three 0.8 s apart, a pike held 4 s, a knee push-up (refused), one more.
const REPS = {
  'pushup-1794163715160.sht': 7,
  'pushup-1794164288747.sht': 8,
  'pushup-1794169596587.sht': 5,
  'pushup-1794607860000.sht': 13,
  'pushup-1794609240000.sht': 10,
  'pushup-1794611100000.sht': 8,
  'pushup-1794612060000.sht': 4,
  'pushup-1794612120000.sht': 4,
  'pushup-1794612180000.sht': 2,
  'pushup-1794614760000.sht': 6,
};
const device = traceFiles('device').filter((path) => path.includes('/pushup-'));
describe.skipIf(device.length === 0)('pushup on device traces', () => {
  it('counts what the phone counted', () => {
    const rows = scoreReps(pushup, REPS);
    expect(
      rows.filter((row) => !row.ok).map((row) => row.clip),
      JSON.stringify(rows),
    ).toEqual([]);
  });
});
