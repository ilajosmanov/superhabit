import { describe, expect, it } from 'vite-plus/test';
import { Joint } from 'reprepgo-pose/joints';

import { sideSquat, squat } from './squat';
import type { Pose } from '@/exercises/body/geometry';
import { body } from './__fixtures__/body';
import { loadTrace, replay, scoreReps, traceFiles } from './__fixtures__/replay';

const FRAME = 66;
/** Each pose held for 2 s, as the counter sees it. */
const play = (poses: Pose[], ex = squat) =>
  poses.reduce((state, pose, i) => {
    for (let t = i * 2000; t < (i + 1) * 2000; t += FRAME)
      state = ex.step(state, ex.measure(pose), t);
    return state;
  }, ex.initial);

const standing = body({});
// `thigh` and `shin` tilt from upright: the knee bends 180 − thigh − shin.
const bottom = body({ thigh: 70, shin: 25 });
const half = body({ thigh: 25, shin: 20 });
/** The same pose lying on its back: gravity along the legs' depth. */
const lying = (pose: Pose): Pose => ({ ...pose, down: { x: 0, y: 0, z: -1 } });

describe('squat', () => {
  it('counts a squat from standing to 85° and back', () => {
    expect(play([standing, bottom, standing])).toMatchObject({
      reps: 1,
      noReps: 0,
      lastRep: { counted: true, depth: expect.closeTo(85, 0), cues: [] },
    });
  });

  it('rejects a 105° squat with a cue to go deeper', () => {
    expect(play([standing, body({ thigh: 50, shin: 25 }), standing])).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, depth: expect.closeTo(105, 0), cues: ['Go deeper'] },
    });
  });

  it('counts a 95° squat', () => {
    expect(play([standing, body({ thigh: 60, shin: 25 }), standing])).toMatchObject({
      reps: 1,
      noReps: 0,
      lastRep: { counted: true, depth: expect.closeTo(95, 0), cues: [] },
    });
  });

  it('counts a rep from a relaxed stance, knees at 155°', () => {
    const relaxed = body({ thigh: 12, shin: 13 });
    expect(play([relaxed, bottom, relaxed])).toMatchObject({ reps: 1, noReps: 0 });
  });

  it('counts a rushed rep, with a cue to slow down', () => {
    let s = squat.initial;
    const spans: [Pose, number, number][] = [
      [standing, 0, 2000],
      [bottom, 2066, 2264],
      [standing, 2330, 4000],
    ];
    for (const [pose, from, to] of spans)
      for (let t = from; t <= to; t += FRAME) s = squat.step(s, squat.measure(pose), t);
    expect(s).toMatchObject({ reps: 1, noReps: 0, lastRep: { cues: ['Slow down'] } });
  });

  it('calls a 135° half squat a failed rep', () => {
    expect(play([standing, half, standing])).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: ['Go deeper'] },
    });
  });

  it.each<[string, Pose]>([
    // Knees at 90° with the thighs upright: the hips never drop.
    ['kneeling', body({ thigh: 0, shin: 90 })],
    // The left thigh (the leg read) forward and level, its knee at 90°; the right leg straight.
    [
      'a kick',
      (() => {
        const kick = body({});
        const { x } = kick.worldLandmarks[Joint.LEFT_HIP];
        kick.worldLandmarks[Joint.LEFT_KNEE] = { x, y: 0, z: -0.45, visibility: 0.9 };
        kick.worldLandmarks[Joint.LEFT_ANKLE] = { x, y: 0.45, z: -0.45, visibility: 0.9 };
        return kick;
      })(),
    ],
    ['bending the knees lying down', lying(bottom)],
  ])('stays silent for %s', (_, pose) => {
    const from = pose.down?.z ? lying(standing) : standing;
    expect(play([from, pose, from])).toMatchObject({ reps: 0, noReps: 0 });
  });

  it('counts side-on on the near leg when the far leg hides', () => {
    const near = (pose: Pose) => {
      for (const i of [Joint.RIGHT_HIP, Joint.RIGHT_KNEE, Joint.RIGHT_ANKLE])
        pose.landmarks[i] = { ...pose.landmarks[i], visibility: 0.2 };
      return pose;
    };
    const up = near(body({ side: true }));
    const down = near(body({ thigh: 70, shin: 25, side: true }));
    expect(play([up, down, up], sideSquat)).toMatchObject({ reps: 1, noReps: 0 });
  });

  it('ends a deep rep lying down as a failed rep, and a shallow dip there as nothing', () => {
    expect(play([standing, bottom, lying(standing)])).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { cues: ['Stand tall'] },
    });
    expect(play([standing, half, lying(standing)])).toMatchObject({ reps: 0, noReps: 0 });
  });

  it('reads nothing without gravity', () => {
    expect(squat.measure({ ...standing, down: undefined })).toBeNull();
  });
});

// Device clips with gravity, front-on, and the reps in their video. Among them: leg kicks, a bend to
// the floor, side lunges, half squats, sitting on the sofa and on the floor (none count), and a deep
// squat held 3.5 s before standing (counts).
const REPS = {
  'squat-1794169405312.sht': 5,
  'squat-1794169429105.sht': 5,
  'squat-1794174480008.sht': 5,
  'squat-1794174540701.sht': 5,
  'squat-1794174641132.sht': 2,
};
const device = traceFiles('device').filter((path) => path.includes('/squat-'));
// Plank and push-up clips with gravity: knees bend there (kneeling), but no squat is done. A dip while
// standing at a clip's edge may still read as a failed rep.
const floor = traceFiles('device').filter((path) => /\/(plank|pushup)-/.test(path));
// Only while the set counts: getting down to the floor before it can read as a squat (off the video:
// plank-1794614940000 at 4 s, pushup-1794614760000 at 12 s).
const whileCounting = (path: string) => {
  const trace = loadTrace(path);
  const stretches = trace.header.stretches?.filter((stretch) => stretch.kind === 'counting');
  return { ...trace, header: { ...trace.header, stretches } };
};
describe.skipIf(device.length === 0)('squat on device clips with gravity', () => {
  // Squat and side squat share one counter: testing one tests both.
  it('counts every rep on the video', () => {
    const rows = scoreReps(squat, REPS);
    expect(
      rows.filter((row) => !row.ok),
      JSON.stringify(rows),
    ).toEqual([]);
  });

  it('counts nothing on plank and push-up clips', () => {
    const reps = floor.map((path) => replay(squat, whileCounting(path)).reps);
    expect(reps.filter((n) => n > 0)).toEqual([]);
  });
});
