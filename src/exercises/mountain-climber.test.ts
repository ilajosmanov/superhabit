import { assert, describe, expect, it } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';

import { measureMountainClimber, mountainClimber } from './mountain-climber';
import type { Pose } from './geometry';
import type { Side } from './sided';
import { plank } from './__fixtures__/plank';
import { loadTrace, replay, traceFiles } from './__fixtures__/replay';

const LEGS = {
  left: [Joint.LEFT_SHOULDER, Joint.LEFT_HIP, Joint.LEFT_KNEE],
  right: [Joint.RIGHT_SHOULDER, Joint.RIGHT_HIP, Joint.RIGHT_KNEE],
} as const;
const start = () => plank({ visible: 'both' });

// Rotate one thigh toward the chest in the side-on plank's plane. A perpendicular thigh
// is a 90° hip; a 60° hip drives farther toward the shoulder. The other leg stays extended.
function drive(side: Side, hipAngle = 60, badSupport = false, sag = 0): Pose {
  const pose = plank({ visible: 'both', sag });
  const [s, h, k] = LEGS[side];
  const world = pose.worldLandmarks;
  const dx = world[s].x - world[h].x;
  const dy = world[s].y - world[h].y;
  const length = Math.hypot(dx, dy);
  const rad = (hipAngle * Math.PI) / 180;
  world[k] = {
    ...world[k],
    x: world[h].x + (0.4 * (dx * Math.cos(rad) - dy * Math.sin(rad))) / length,
    y: world[h].y + (0.4 * (dy * Math.cos(rad) + dx * Math.sin(rad))) / length,
  };
  const ankle = side === 'left' ? Joint.LEFT_ANKLE : Joint.RIGHT_ANKLE;
  world[ankle] = { ...world[k], x: world[k].x - 0.4, y: world[k].y + 0.1 };
  if (badSupport) for (const wrist of [Joint.LEFT_WRIST, Joint.RIGHT_WRIST]) world[wrist].x -= 1.2;
  return pose;
}

function rotate(pose: Pose, halfTurn: boolean): Pose {
  return {
    ...pose,
    worldLandmarks: pose.worldLandmarks.map(({ x, y, z, visibility }) =>
      halfTurn ? { x: -x, y: -y, z, visibility } : { x: -y, y: z, z: x, visibility },
    ),
  };
}

function player(transform = (pose: Pose) => pose) {
  let state = mountainClimber.initial;
  let nowMs = 0;
  function hold(pose: Pose | null, frames = 24) {
    for (let i = 0; i < frames; i++) {
      state = mountainClimber.step(state, pose && measureMountainClimber(transform(pose)), nowMs);
      nowMs += 66;
    }
    return state;
  }
  function rep(side: Side, hipAngle = 60) {
    hold(drive(side, hipAngle));
    return hold(start());
  }
  return { hold, rep };
}

describe('measureMountainClimber', () => {
  it.each(['left', 'right'] as const)(
    'measures the %s hip without borrowing the other leg',
    (side) => {
      const sample = measureMountainClimber(drive(side, 90));
      assert(sample);
      expect(sample[side]?.hip).toBeCloseTo(90);
      expect(sample[side === 'left' ? 'right' : 'left']?.hip).toBeCloseTo(180);
      expect(sample.joints).toEqual(LEGS[side]);
      expect(sample.torso).toBeLessThan(30);
      expect(sample.wrist).toBeCloseTo(0);
    },
  );

  it.each(['left', 'right'] as const)('keeps an unseen %s knee null', (side) => {
    const pose = drive(side);
    pose.landmarks[LEGS[side][2]].visibility = 0.05;
    const other = side === 'left' ? 'right' : 'left';
    expect(measureMountainClimber(pose)).toMatchObject({
      [side]: null,
      [other]: { hip: expect.closeTo(180) },
      joints: LEGS[other],
    });
    pose.landmarks[LEGS[other][2]].x = 1.1;
    expect(measureMountainClimber(pose)).toBeNull();
  });

  it('uses the visible arm for support while keeping both hip signals', () => {
    const pose = drive('left');
    pose.landmarks[Joint.LEFT_WRIST].visibility = 0.05;
    expect(measureMountainClimber(pose)).toMatchObject({
      left: { hip: expect.closeTo(60) },
      right: { hip: expect.closeTo(180) },
      wrist: expect.closeTo(0),
    });
    pose.landmarks[Joint.RIGHT_WRIST].x = 1.1;
    expect(measureMountainClimber(pose)).toBeNull();
  });

  it.each(['left', 'right'] as const)(
    'keeps the support ankle when its knee is hidden during a %s drive',
    (side) => {
      const pose = drive(side);
      const other = side === 'left' ? 'right' : 'left';
      pose.landmarks[LEGS[other][2]].visibility = 0.05;
      expect(measureMountainClimber(pose)).toMatchObject({
        [side]: { hip: expect.closeTo(60) },
        [other]: null,
        body: expect.closeTo(180),
        wrist: expect.closeTo(0),
        joints: LEGS[side],
      });
    },
  );

  it('needs a visible supporting ankle rather than inventing a floor direction', () => {
    const pose = start();
    for (const ankle of [Joint.LEFT_ANKLE, Joint.RIGHT_ANKLE])
      pose.landmarks[ankle].visibility = 0.05;
    expect(measureMountainClimber(pose)).toBeNull();
  });

  it('rejects a collapsed support line', () => {
    const pose = start();
    for (const ankle of [Joint.LEFT_ANKLE, Joint.RIGHT_ANKLE])
      pose.worldLandmarks[ankle] = pose.worldLandmarks[Joint.LEFT_WRIST];
    expect(measureMountainClimber(pose)).toBeNull();
  });

  it('rejects invalid hip geometry and degenerate support', () => {
    const pose = start();
    pose.worldLandmarks[Joint.LEFT_KNEE] = pose.worldLandmarks[Joint.LEFT_HIP];
    expect(measureMountainClimber(pose)?.left).toBeNull();
    pose.worldLandmarks[Joint.RIGHT_KNEE].x = NaN;
    expect(measureMountainClimber(pose)).toBeNull();
    const support = start();
    support.worldLandmarks[Joint.LEFT_WRIST] = support.worldLandmarks[Joint.LEFT_SHOULDER];
    expect(measureMountainClimber(support)).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity])('rejects invalid support coordinates (%s)', (x) => {
    const pose = start();
    pose.worldLandmarks[Joint.LEFT_HIP].x = x;
    expect(measureMountainClimber(pose)).toBeNull();
  });
});

describe('mountainClimber', () => {
  it('counts each knee drive, including repeated drives on the same side', () => {
    const p = player();
    expect(mountainClimber.stats(mountainClimber.initial)).toBeNull();
    p.hold(start());
    expect(p.rep('left').reps).toBe(1);
    expect(p.rep('left').reps).toBe(2);
    const state = p.rep('right');
    expect(state).toMatchObject({
      reps: 3,
      noReps: 0,
      left: { reps: 2 },
      right: { reps: 1 },
      lastRep: { counted: true, cues: [] },
    });
    expect(mountainClimber.stats(state)).toMatch(/^60° · [\d.]+s↑$/);
  });

  it.each([6, 12])('counts alternating gradual drives with %s frames each way', (frames) => {
    const p = player();
    p.hold(start());
    for (const side of ['left', 'right'] as const) {
      for (let i = 1; i <= frames; i++) p.hold(drive(side, 180 - (120 * i) / frames), 1);
      for (let i = frames - 1; i >= 0; i--) p.hold(drive(side, 180 - (120 * i) / frames), 1);
      p.hold(start(), 6);
    }
    expect(p.hold(start())).toMatchObject({ reps: 2, noReps: 0 });
  });

  it.each(['left', 'right'] as const)('rejects a shallow %s drive with its cue', (side) => {
    const p = player();
    p.hold(start());
    expect(p.rep(side, 110)).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, cues: ['Drive your knee closer to your chest'] },
    });
  });

  it('rejects a drive made without support from its first frame', () => {
    const p = player();
    p.hold(start());
    p.hold(drive('left', 60, true));
    expect(p.hold(start())).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, cues: ['Keep a plank with hands under shoulders'] },
    });
    expect(p.rep('left')).toMatchObject({ reps: 1, noReps: 1 });
  });

  it('rejects a drive with piked hips even when the torso is nearly parallel to the floor', () => {
    const p = player();
    p.hold(start());
    const piked = drive('left', 60, false, -50);
    expect(measureMountainClimber(piked)).toMatchObject({
      body: expect.closeTo(130),
      wrist: expect.closeTo(0),
    });
    expect(measureMountainClimber(piked)?.torso).toBeLessThan(20);
    p.hold(piked);
    expect(p.hold(start())).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, cues: ['Keep a plank with hands under shoulders'] },
    });
  });

  it.each([6, 24])('rejects a drive that loses support for %s frames with its cue', (frames) => {
    const p = player();
    p.hold(start());
    p.hold(drive('left'));
    // 396 ms and 1584 ms: form failure must survive either side of the tracking timeout.
    expect(p.hold(drive('left', 60, true), frames).left.phase).toBe('down');
    expect(p.hold(start())).toMatchObject({
      reps: 0,
      noReps: 1,
      lastRep: { counted: false, cues: ['Keep a plank with hands under shoulders'] },
    });
  });

  it.each([true, false])(
    'counts and checks support in a rotated world (half turn %s)',
    (halfTurn) => {
      const p = player((pose) => rotate(pose, halfTurn));
      expect(p.hold(plank({ standing: true, visible: 'both' }))).toMatchObject({
        phase: 'waiting',
        reps: 0,
        noReps: 0,
      });
      p.hold(start());
      expect(p.rep('left')).toMatchObject({ reps: 1, noReps: 0 });
      expect(p.rep('right')).toMatchObject({ reps: 2, noReps: 0 });
      p.hold(drive('right', 60, true));
      expect(p.hold(start())).toMatchObject({
        reps: 2,
        noReps: 1,
        lastRep: { counted: false, cues: ['Keep a plank with hands under shoulders'] },
      });
    },
  );

  it('waits for an extended leg in a high plank before counting', () => {
    const p = player();
    expect(p.hold(plank({ standing: true, visible: 'both' }))).toMatchObject({
      phase: 'waiting',
      reps: 0,
    });
    expect(p.hold(drive('left')).left.phase).toBe('waiting');
    expect(p.hold(start())).toMatchObject({ reps: 0, noReps: 0, lastRep: null });
    expect(p.rep('left').reps).toBe(1);
  });

  it('never counts knee drives when wrists are away from the shoulders', () => {
    const p = player();
    p.hold(drive('left', 180, true));
    p.hold(drive('left', 60, true));
    expect(p.hold(drive('left', 180, true))).toMatchObject({ phase: 'waiting', reps: 0 });
  });

  it('returns to waiting after tracking loss and discards the unfinished drive', () => {
    const p = player();
    p.hold(start());
    expect(p.hold(drive('right')).right.phase).toBe('down');
    expect(p.hold(null)).toMatchObject({
      phase: 'waiting',
      reps: 0,
      noReps: 0,
      left: { phase: 'waiting' },
      right: { phase: 'waiting' },
    });
    expect(p.hold(start())).toMatchObject({ reps: 0, noReps: 0 });
    expect(p.rep('right').reps).toBe(1);
  });

  it('counts only the visible leg after the other knee is lost', () => {
    const p = player();
    p.hold(start());
    const pose = drive('left');
    pose.landmarks[Joint.LEFT_KNEE].visibility = 0.05;
    p.hold(pose);
    expect(p.hold(start()).reps).toBe(0);
    expect(p.rep('right').reps).toBe(1);
  });

  it.each(['left', 'right'] as const)(
    'counts a clean %s drive when the stationary knee is hidden',
    (side) => {
      const other = side === 'left' ? 'right' : 'left';
      const p = player((pose) => {
        pose.landmarks[LEGS[other][2]].visibility = 0.05;
        return pose;
      });
      p.hold(start());
      expect(p.rep(side)).toMatchObject({
        reps: 1,
        noReps: 0,
        [side]: { reps: 1 },
        [other]: { phase: 'waiting', reps: 0 },
        lastRep: { counted: true, cues: [] },
      });
    },
  );
});

// Inspected labels.reps and source.dataset/clip/name/acceptedCounts/view. PushUpBench's
// climbers_[14] contains ~7 drives per leg, labelled 14; Countix N74dtZPMKXU contains
// ~2 left + 3 right drives, labelled 5. Each knee drive is one rep, without label rescaling.
// After separating support-ankle selection from knee visibility, swept up 120–145°,
// down 95–110°, body 125–135°, torso 40–50°, wrist 45–55° and filter cutoff 1–3 Hz.
// Best is 6/19 (<12), with a permissive 125° body gate and 125°/105° cycle at 3 Hz.
// Keep the wider 135°/105° cycle and plank-like 135° body gate: measured baseline 3/19.
const MIN_OK = 3;
const files = traceFiles('mountain-climber');
describe.skipIf(files.length === 0)('mountain climber on real traces', () => {
  it('preserves the measured baseline on labelled clips', () => {
    const rows = files.flatMap((path) => {
      const trace = loadTrace(path);
      if (trace.labels.reps === undefined) return [];
      const expected = trace.labels.reps;
      const got = replay(mountainClimber, trace).reps;
      return [
        {
          clip: trace.source.clip,
          expected,
          got,
          ok: Math.abs(got - expected) <= Math.max(1, Math.round(0.1 * expected)),
        },
      ];
    });
    expect(rows.filter((row) => row.ok).length, JSON.stringify(rows)).toBeGreaterThanOrEqual(
      MIN_OK,
    );
  });

  // One false rep in stu7_45.mp4, two in plank_2.mp4 and one in plank_7.mp4;
  // pin these totals while the exercise remains unregistered.
  for (const [exercise, maxFalse] of [
    ['squat', 0],
    ['pushup', 1],
    ['plank', 3],
  ] as const) {
    const others = traceFiles(exercise);
    it.skipIf(others.length === 0)(`pins false counts on ${exercise} traces`, () => {
      const rows = others.map((path) => {
        const trace = loadTrace(path);
        return { clip: trace.source.clip, reps: replay(mountainClimber, trace).reps };
      });
      expect(
        rows.reduce((sum, row) => sum + row.reps, 0),
        JSON.stringify(rows),
      ).toBeLessThanOrEqual(maxFalse);
    });
  }
});
