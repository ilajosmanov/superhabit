import type { PoseLandmark } from 'superhabit-pose';
import { assert, describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import {
  measureSideSquat,
  measureSquat,
  sideSquat,
  squat,
  type SquatSample,
  type SquatState,
} from './squat';
import type { Pose } from './geometry';
import { body } from './__fixtures__/body';
import { scoreReps, traceFiles } from './__fixtures__/replay';

const joints = [Joint.LEFT_HIP, Joint.LEFT_KNEE, Joint.LEFT_ANKLE] as const;
// A knee-only sample with the hips dropped, so these tests exercise the knee state machine.
const at = (deg: number | null): SquatSample | null =>
  deg === null ? null : { legs: [deg, deg], hip: 0, lean: 0, valgus: null, joints };
const FRAME = 66; // ms between detector results
// The next frame's time after `s`'s last valid angle.
const later = (s: SquatState) => (s.lastSeenAt ?? 0) + FRAME;
// Each valid angle is held long enough for the smoothing filter to settle on it; anything else is one bad frame.
const run = (angles: (number | null)[], from: SquatState = squat.initial) =>
  angles.reduce(
    (state, deg) =>
      Array.from({ length: deg !== null && deg >= 0 && deg <= 180 ? 200 : 1 }).reduce<SquatState>(
        (s, _, i) => squat.step(s, at(deg), later(state) + i * FRAME),
        state,
      ),
    from,
  );
// [sample, fromMs, toMs]: hold a sample, polling every frame.
const play = (
  spans: [SquatSample | null, fromMs: number, toMs?: number][],
  start = squat.initial,
) =>
  spans.reduce((state, [sample, from, to = from]) => {
    for (let t = from; t <= to; t += FRAME) state = squat.step(state, sample, t);
    return state;
  }, start);
const runTimed = (
  spans: [deg: number | null, fromMs: number, toMs?: number][],
  start: SquatState = squat.initial,
) =>
  play(
    spans.map(([deg, from, to]) => [at(deg), from, to]),
    start,
  );

describe('squat.step', () => {
  it('waits for standing before counting an attempt, including after reset', () => {
    expect(run([90, 120, 150])).toMatchObject({
      reps: 0,
      noReps: 0,
      phase: 'waiting',
      lastRep: null,
    });
    expect(run([90, 175])).toMatchObject({ reps: 0, noReps: 0, phase: 'up', lastRep: null });
    expect(run([120, 175])).toMatchObject({ reps: 0, noReps: 0, phase: 'up', lastRep: null });
    expect(run([90, 175, 90, 175])).toMatchObject({ reps: 1, noReps: 0, lastRep: { depth: 90 } });
  });

  it('accepts the exact standing and depth thresholds', () => {
    const s = run([160, 100, 160]);
    expect(s).toMatchObject({ reps: 1, noReps: 0, phase: 'up' });
    expect(s.lastRep?.depth).toBeCloseTo(100); // the filter settles to within float rounding
  });

  it('counts a full-depth rep once', () => {
    const s = run([175, 140, 95, 85, 85, 90, 130, 170, 175]);
    expect(s).toMatchObject({ reps: 1, noReps: 0, phase: 'up', lastRep: { depth: 85 } });
  });

  it('flags a half squat as a no-rep', () => {
    const s = run([175, 150, 120, 150, 170]);
    expect(s).toMatchObject({ reps: 0, noReps: 1 });
    expect(s.lastRep?.depth).toBeCloseTo(120);
  });

  it('ignores frames without a pose and small wobbles while standing', () => {
    const s = run([175, null, 150, 172, null, 90, null, 165]);
    expect(s).toMatchObject({ reps: 1, noReps: 0 });
  });

  it('does not count without returning to standing', () => {
    expect(run([170, 90, 150, 95, 150]).reps).toBe(0);
  });

  it('tolerates short tracking gaps, including exactly one second', () => {
    const s = runTimed([
      [175, 0, 1000],
      [90, 1066, 3000],
      [null, 3500],
      [null, 3980],
      [175, 3980, 6000], // last 90° sample was at 2980 ms
    ]);
    expect(s).toMatchObject({ reps: 1, noReps: 0 });
    expect(s.lastRep?.depth).toBeCloseTo(90);
  });

  it.each([90, 120])('cancels an unfinished %s° attempt after losing tracking', (deg) => {
    const previous = runTimed([
      [175, 0, 2000],
      [85, 2066, 4000],
      [175, 4066, 6000],
      [120, 6066, 8000],
      [175, 8066, 10000],
      [deg, 10066, 12000],
    ]);
    const { lastSeenAt } = previous;
    assert(lastSeenAt !== undefined);
    const lost = squat.step(previous, null, lastSeenAt + 1001);
    expect(lost).toMatchObject({ reps: 1, noReps: 1, phase: 'waiting', min: 180, lastSeenAt });
    expect(lost.lastRep?.depth).toBeCloseTo(120);
    expect(lost.filter).toBeUndefined();
    // After the filter reset, standing is read immediately and must be held for two samples.
    const back = squat.step(lost, at(175), lastSeenAt + 1100);
    expect(back.phase).toBe('waiting');
    expect(squat.step(back, at(175), lastSeenAt + 1166)).toMatchObject({
      reps: 1,
      noReps: 1,
      phase: 'up',
    });
  });

  it('expires an attempt even when polling stalls, then accepts the next full cycle', () => {
    const resumed = runTimed([
      [175, 0, 2000],
      [90, 2066, 4000],
      [175, 5100, 7000],
    ]);
    expect(resumed).toMatchObject({ reps: 0, noReps: 0, phase: 'up', lastRep: null });
    expect(
      runTimed(
        [
          [90, 7066, 9000],
          [175, 9066, 11000],
        ],
        resumed,
      ),
    ).toMatchObject({ reps: 1, noReps: 0 });
  });

  it('does not extend tracking lifetime with invalid angles', () => {
    expect(
      runTimed([
        [175, 0, 2000],
        [90, 2066, 4000],
        [NaN, 4500],
        [175, 5100, 7000],
      ]),
    ).toMatchObject({ reps: 0, noReps: 0, lastRep: null });
  });

  it.each([NaN, Infinity, -Infinity, -1, 181])(
    'ignores invalid angles (%s) without losing a pending rep or corrupting its depth',
    (invalid) => {
      const down = run([175, 90]);
      expect(squat.step(down, at(invalid), later(down))).toBe(down);
      expect(run([175], squat.step(down, at(invalid), later(down)))).toMatchObject({
        reps: 1,
        noReps: 0,
        lastRep: { depth: 90 },
      });
      expect(run([175, invalid, 120, 175])).toMatchObject({
        reps: 0,
        noReps: 1,
        lastRep: { depth: 120 },
      });
    },
  );
});

describe('glitches, hip depth and rep report', () => {
  const standing = measureSquat(body({}));
  const bottom = measureSquat(body({ thigh: 70, shin: 25 })); // 85° knee, hips well down

  it('measures hip drop, trunk lean and knee width from world landmarks', () => {
    expect(standing).toMatchObject({ legs: [180, 180], lean: 0, valgus: 1 });
    expect(standing?.hip).toBeCloseTo(1);
    expect(bottom?.hip).toBeCloseTo(Math.cos((70 * Math.PI) / 180));
    expect(measureSquat(body({ lean: 30 }))?.lean).toBeCloseTo(30);
    // Shoulders above the frame are model guesses, so lean is not measured.
    const cropped = body({ lean: 30 });
    cropped.landmarks[Joint.LEFT_SHOULDER] = { ...cropped.landmarks[Joint.LEFT_SHOULDER], y: -0.1 };
    expect(measureSquat(cropped)?.lean).toBe(0);
    expect(measureSquat(body({ knees: 0.06 }))?.valgus).toBeCloseTo(0.6);
    // Side-on, knee width is depth and not trustworthy.
    const side = measureSquat(body({ thigh: 70, shin: 25, side: true }));
    expect(side?.valgus).toBeNull();
    assert(bottom);
    expect(side?.hip).toBeCloseTo(bottom.hip);
  });

  it('reports the hip, knee and ankle of the better-seen leg', () => {
    expect(standing?.joints).toEqual([Joint.LEFT_HIP, Joint.LEFT_KNEE, Joint.LEFT_ANKLE]);
    const pose = body({});
    pose.landmarks[Joint.LEFT_KNEE] = { ...pose.landmarks[Joint.LEFT_KNEE], visibility: 0.6 };
    expect(measureSquat(pose)?.joints).toEqual([
      Joint.RIGHT_HIP,
      Joint.RIGHT_KNEE,
      Joint.RIGHT_ANKLE,
    ]);
  });

  it('smooths away a single-frame spike', () => {
    const spike = (deg: number) =>
      play([
        [standing, 0, 2000],
        [at(deg), 2066],
        [standing, 2132, 4000],
      ]);
    // A one-frame dip past DOWN is cut to ~127°: no phase change, not even a no-rep.
    expect(spike(100)).toMatchObject({ reps: 0, noReps: 0, phase: 'up', lastRep: null });
    // A huge glitch is never a rep (it can still read as a shallow no-rep).
    expect(spike(80).reps).toBe(0);
  });

  it('switches phase only once a crossing holds for two samples', () => {
    const once = squat.step(squat.initial, standing, 0);
    expect(once.phase).toBe('waiting');
    expect(squat.step(once, standing, 66).phase).toBe('up');
  });

  it('requires the hips to drop, so kneeling or leaning in is not a rep', () => {
    const kneel = measureSquat(body({ thigh: 0, shin: 90 })); // knees at 90°, hips not lowered
    assert(kneel);
    expect(Math.max(...kneel.legs)).toBeCloseTo(90);
    const s = play([
      [standing, 0, 2000],
      [kneel, 2066, 4000],
      [standing, 4066, 6000],
    ]);
    // Not even a no-rep: the voice must stay quiet when you kneel or bend to the phone.
    expect(s).toMatchObject({ reps: 0, noReps: 0, phase: 'up', lastRep: null });
  });

  it('still calls a real half squat a no-rep', () => {
    const half = measureSquat(body({ thigh: 25, shin: 20 })); // 135° knee, hips slightly down
    const s = play([
      [standing, 0, 2000],
      [half, 2066, 4000],
      [standing, 4066, 6000],
    ]);
    expect(s).toMatchObject({ reps: 0, noReps: 1, lastRep: { cues: ['Go deeper'] } });
  });

  it('reports a clean rep with no cues', () => {
    const s = play([
      [standing, 0, 2000],
      [bottom, 2066, 3500],
      [standing, 3566, 5000],
    ]);
    expect(s.reps).toBe(1);
    const rep = s.lastRep;
    assert(rep);
    expect(rep).toMatchObject({ counted: true, symmetry: 0, lean: 0, valgus: 1, cues: [] });
    expect(rep.depth).toBeCloseTo(85, 0);
    expect(rep.downMs).toBeGreaterThan(1000);
    expect(rep.upMs).toBeGreaterThan(0);
  });

  it('cues lean, caving knees and rushing', () => {
    const sloppy = measureSquat(body({ thigh: 70, shin: 25, lean: 50, knees: 0.06 }));
    const s = play([
      [standing, 0, 2000],
      [sloppy, 2066, 2264],
      [standing, 2330, 4000],
    ]);
    expect(s.reps).toBe(1);
    expect(s.lastRep).toMatchObject({ cues: ['Chest up', 'Knees out', 'Slow down'] });
    const rep = s.lastRep;
    assert(rep && rep.downMs !== null && rep.upMs !== null);
    expect(rep.lean).toBeCloseTo(50);
    expect(rep.valgus).toBeCloseTo(0.6);
    expect(rep.downMs + rep.upMs).toBeLessThan(800);
  });

  it('cues uneven legs and a shallow no-rep', () => {
    const uneven: SquatSample = { legs: [95, 75], hip: 0, lean: 0, valgus: null, joints };
    const s = play([
      [at(175), 0, 2000],
      [uneven, 2066, 4000],
      [at(175), 4066, 6000],
      [at(120), 6066, 8000],
      [at(175), 8066, 10000],
    ]);
    expect(s).toMatchObject({ reps: 1, noReps: 1 });
    expect(s.lastRep).toMatchObject({ counted: false, cues: ['Go deeper'] });
    const rep = play([
      [at(175), 0, 2000],
      [uneven, 2066, 4000],
      [at(175), 4066, 6000],
    ]).lastRep;
    assert(rep);
    expect(rep.symmetry).toBeGreaterThan(10);
    expect(rep.cues).toEqual(['Even out your legs']);
  });
});

describe('knee angles', () => {
  type Leg = [x: number, y: number, z?: number][]; // hip, knee, ankle
  const straight: Leg = [
    [0.5, 0.4],
    [0.5, 0.6],
    [0.5, 0.8],
  ];
  // Thigh horizontal, shin vertical: a 90° knee.
  const bent: Leg = [
    [0.7, 0.6],
    [0.5, 0.6],
    [0.5, 0.8],
  ];
  // Same pose, but seen from the front: the thigh points at the camera (z), so in 2D it looks straight.
  const bentTowardCamera: Leg = [
    [0.5, 0.6, -0.2],
    [0.5, 0.6, 0],
    [0.5, 0.8, 0],
  ];
  // Image and world points share coordinates here; only the angle maths uses `world`.
  const pose = (left: Leg, right: Leg, vis = 0.9): Pose => {
    const make = () =>
      Array.from({ length: 33 }, (): PoseLandmark => ({ x: 0.5, y: 0.5, z: 0, visibility: vis }));
    const image = make();
    const world = make();
    const put = (idx: number[], leg: Leg) =>
      idx.forEach((i, j) => {
        const [x, y, z = 0] = leg[j];
        image[i] = { x, y, z: 0, visibility: vis };
        world[i] = { x, y, z, visibility: vis };
      });
    put([Joint.LEFT_HIP, Joint.LEFT_KNEE, Joint.LEFT_ANKLE], left);
    put([Joint.RIGHT_HIP, Joint.RIGHT_KNEE, Joint.RIGHT_ANKLE], right);
    return { landmarks: image, worldLandmarks: world };
  };
  const legs = (p: Pose) => measureSquat(p)?.legs;
  const deg = (d: number) => expect.closeTo(d);

  it('reads straight legs as ~180°', () => {
    expect(legs(pose(straight, straight))).toEqual([deg(180), deg(180)]);
  });

  it('reads a bent knee as ~90°', () => {
    expect(legs(pose(bent, bent))).toEqual([deg(90), deg(90)]);
  });

  it('measures the knee in 3D, so a front-facing squat still reads as bent', () => {
    expect(legs(pose(bentTowardCamera, bentTowardCamera))).toEqual([deg(90), deg(90)]);
  });

  it('drops a frame where hip and knee coincide, so it never reads as a deep rep', () => {
    // Both legs: one bad leg alone is already dropped by the asymmetry check.
    const collapsed: Leg = [
      [0.5, 0.6],
      [0.5, 0.6],
      [0.5, 0.8],
    ];
    expect(measureSquat(pose(collapsed, collapsed))).toBeNull();
  });

  it('ignores one bent leg, so a leg circle is not a squat', () => {
    expect(measureSquat(pose(bent, straight))).toBeNull();
    expect(measureSquat(pose(straight, bent))).toBeNull();
  });

  it('drops mis-tracked frames where the legs disagree', () => {
    // From a device log while walking out of frame: right knee thrown far from the hip (162° vs 96°).
    const left: Leg = [
      [0.8, 0.54],
      [0.84, 0.77],
      [0.79, 0.99],
    ];
    const right: Leg = [
      [0.58, 0.5],
      [0.17, 0.44],
      [0.1, 0.61],
    ];
    expect(measureSquat(pose(left, right))).toBeNull();
  });

  it('returns null when a leg is not visible', () => {
    expect(measureSquat(pose(straight, straight, 0.2))).toBeNull();
  });

  it('uses image visibility, not optional world-landmark visibility, to accept joints', () => {
    const p = pose(bentTowardCamera, bentTowardCamera);
    p.worldLandmarks.forEach((point) => {
      point.visibility = 0;
    });
    expect(legs(p)).toEqual([deg(90), deg(90)]);
  });

  it('returns null for coincident world joints', () => {
    const p = pose(straight, straight);
    p.worldLandmarks[Joint.LEFT_HIP] = { ...p.worldLandmarks[Joint.LEFT_KNEE] };
    expect(measureSquat(p)).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity])('returns null for invalid world coordinates (%s)', (x) => {
    const p = pose(straight, straight);
    p.worldLandmarks[Joint.LEFT_HIP].x = x;
    expect(measureSquat(p)).toBeNull();
  });

  it('returns null when a joint is outside the frame (walked up to the phone)', () => {
    const ankleOffScreen: Leg = [
      [0.5, 0.7],
      [0.5, 0.9],
      [0.6, 1.08],
    ];
    expect(measureSquat(pose(ankleOffScreen, straight))).toBeNull();
  });

  it('keeps feet that are close to, but inside, the bottom edge', () => {
    // Real squat bottom from a device log: ankles at y 0.98–0.99.
    const deep: Leg = [
      [0.65, 0.84],
      [0.74, 0.87],
      [0.7, 0.99],
    ];
    expect(measureSquat(pose(deep, deep))).not.toBeNull();
  });
});

// 87a35a1: 1/10 within ±1. Measured baseline; counter refactors must not lower it.
const MIN_OK = 1;
const files = traceFiles('squat');
describe('side-on squats', () => {
  const FAR = [Joint.RIGHT_HIP, Joint.RIGHT_KNEE, Joint.RIGHT_ANKLE];
  /** Side-on with the far leg hidden behind the near one. */
  const near = (thigh: number, shin: number) => {
    const pose = body({ thigh, shin, side: true });
    for (const i of FAR) pose.landmarks[i] = { ...pose.landmarks[i], visibility: 0.2 };
    return pose;
  };

  it('counts on the near leg alone, which front-on squats refuse', () => {
    expect(measureSquat(near(70, 25))).toBeNull();
    const s = [near(0, 0), near(70, 25), near(0, 0)].reduce<SquatState>((state, pose) => {
      const from = (state.lastSeenAt ?? 0) + FRAME;
      for (let i = 0; i < 60; i++)
        state = sideSquat.step(state, sideSquat.measure(pose), from + i * FRAME);
      return state;
    }, sideSquat.initial);
    expect(s).toMatchObject({ reps: 1, noReps: 0, lastRep: { depth: expect.closeTo(85) } });
  });

  it('still refuses uneven legs when both are seen, as in a lunge', () => {
    // The near knee at 85°, the far leg straight below its hip.
    const lunge = body({ thigh: 70, shin: 25, side: true });
    const hip = lunge.worldLandmarks[Joint.RIGHT_HIP];
    lunge.worldLandmarks[Joint.RIGHT_KNEE] = { ...hip, y: 0.45 };
    lunge.worldLandmarks[Joint.RIGHT_ANKLE] = { ...hip, y: 0.9 };
    expect(measureSideSquat(lunge)).toBeNull();
  });
});

describe.skipIf(files.length === 0)('squat on real traces', () => {
  it('counts within ±1 on enough clips', () => {
    const rows = scoreReps(squat, files, 1);
    expect(rows.filter((row) => row.ok).length, JSON.stringify(rows)).toBeGreaterThanOrEqual(
      MIN_OK,
    );
  });
});
