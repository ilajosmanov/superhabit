import { describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

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

// Before the plank position: the same 6 missed, so 4/10 within ±1 both ways.
const MISSES = [
  'stu4_46.mp4',
  'stu5_47.mp4',
  'stu7_45.mp4',
  'stu8_42.mp4',
  'stu8_45.mp4',
  'stu9_52.mp4',
];
const files = traceFiles('pushup');
describe.skipIf(files.length === 0)('pushup on real traces', () => {
  // By name, so one clip getting worse can't hide behind another getting better.
  it('counts within ±1 on every clip but the known misses', () => {
    const rows = scoreReps(pushup, files, 1);
    expect(
      rows.filter((row) => !row.ok).map((row) => row.clip),
      JSON.stringify(rows),
    ).toEqual(MISSES);
  });
});

// Labels here are what the phone's counter said when the clip was saved, not a human count: this
// guards "still counts what your phone counted", e.g. device knees that read bent with the knees up.
// pushup-1794163715160 (gravity) is labelled from its video instead: 7, where the phone said 0 under a
// broken hip rule. pushup-1794163255470 (no gravity) counts 3 of 5: without gravity the support-line
// hip ratio dips under HIPS_MIN for a frame mid-descent, failing two reps; gravity clips use the hip
// drop instead. pushup-1794164288747 counts 5 of 6, as the phone did: two reps behind a table leg
// read 111–119° and the 4th bottomed at 101°, just above `down`.
const device = traceFiles('device').filter((path) => path.includes('/pushup-'));
describe.skipIf(device.length === 0)('pushup on device traces', () => {
  it('counts what the phone counted, but the one clip saved mid-set and one without gravity', () => {
    const rows = scoreReps(pushup, device, 0);
    expect(
      rows.filter((row) => !row.ok).map((row) => row.clip),
      JSON.stringify(rows),
    ).toEqual(['pushup-1794098368362.json', 'pushup-1794163255470.json']);
  });
});
