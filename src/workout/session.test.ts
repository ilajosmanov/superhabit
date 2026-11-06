import type { PoseDetection } from 'superhabit-pose';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';
import { createActor } from 'xstate';

import type { VideoOutput } from './camcorder';
import { defineChallenge, MAX, reps, seconds, type Step } from './plan';
import { EXERCISES, type Pose } from '@/exercises/registry';
import { body } from '@/exercises/__fixtures__/body';
import { plank } from '@/exercises/__fixtures__/plank';
import { replay } from '@/exercises/__fixtures__/replay';
import { parseTrace } from '@/exercises/trace';

const speak = vi.fn();
const lockAsync = vi.fn(async () => {});
// The fake native detector: the session sets `onResult`, the test calls it like native would.
const native: { close: () => void; onResult?: (result: PoseDetection) => void } = {
  close: vi.fn(),
};
vi.mock('superhabit-pose', () => ({ createPoseLandmarker: () => native }));
vi.mock('expo-speech', () => ({ speak, stop: vi.fn() }));
// The fake cache folder: names of the files in it.
const disk = new Set<string>();
const written: { name: string; text: string }[] = [];
const createDirectory = vi.fn();
const writeFile = vi.fn(async (name: string, text: string) => {
  written.push({ name, text });
});
const cached = (name: string) => ({
  uri: `file:///cache/reps/${name}`,
  get exists() {
    return disk.has(name);
  },
  delete: () => disk.delete(name),
  write: (text: string) => writeFile(name, text),
});
vi.mock('expo-file-system', () => ({
  Paths: { cache: {}, document: {} },
  Directory: class {
    exists = true;
    create = createDirectory;
    list = () => [...disk].map(cached);
  },
  File: class {
    constructor(_dir: unknown, name: string) {
      return cached(name);
    }
  },
}));
vi.mock('expo-screen-orientation', () => ({
  lockAsync,
  OrientationLock: { PORTRAIT_UP: 3, LANDSCAPE: 5 },
}));

const { workoutSession, sessionView } = await import('./session');

const PORTRAIT = 3;
const LANDSCAPE = 5;
const NOW = Date.UTC(2026, 10, 6, 7);
let clock = 0;
let frames = 0;
// Holds a pose `ms` at detector speed, continuing the clock across calls.
const hold = (ms: number, pose: Pose) => {
  for (const end = clock + ms; clock <= end; clock += 66, frames++)
    native.onResult?.({
      timestampMs: clock,
      ...pose,
      cameraLandmarks: [],
    });
};
// Holds each pose 1.5 s.
const play = (...poses: Pose[]) => poses.forEach((pose) => hold(1500, pose));
const squat = () => play(body({}), body({ thigh: 70, shin: 25 }), body({}));
const halfSquat = () => play(body({ thigh: 25, shin: 20 }), body({})); // a no-rep
const feetOut = (pose: Pose): Pose => {
  for (const i of [Joint.LEFT_ANKLE, Joint.RIGHT_ANKLE])
    pose.landmarks[i] = { ...pose.landmarks[i], y: 1.2 };
  return pose;
};
const headOut = (pose: Pose): Pose => {
  for (const i of [Joint.NOSE, Joint.LEFT_SHOULDER, Joint.RIGHT_SHOULDER])
    pose.landmarks[i] = { ...pose.landmarks[i], y: -0.2 };
  return pose;
};
const spoken = () => speak.mock.calls.map(([text]) => text);
const pushup = () => play(plank({ elbow: 170 }), plank({ elbow: 80 }), plank({ elbow: 170 }));

const plan = (...steps: [Step, ...Step[]]) =>
  defineChallenge({
    name: 't',
    days: 1,
    restartOnMiss: false,
    session: [{ steps, rounds: 1 }],
  });
const squatTest = plan({ exercise: 'squat', goal: MAX });
const challenge = plan({ exercise: 'squat', goal: reps(1) }, { exercise: 'pushup', goal: reps(1) });

afterEach(() => vi.useRealTimers());

type Take = {
  stopped: boolean;
  /** The file is final (finished or failed). */
  final: boolean;
  /** Every earlier take was final when this one started. */
  afterFinal: boolean;
  /** Ends the recording like the OS would (or the encoder, with an error). */
  end: (error?: Error) => void;
};
// The fake camera video output, like VisionCamera on CameraX: a take's file appears once it has started,
// is final a tick after the recording ends (or once released from `finalizing`), and stopping a recording that has ended rejects.
const takes: Take[] = [];
let finalizing: (() => void)[] | null = null;
const video: VideoOutput = {
  createRecorder: async ({ filePath = '' }) => {
    let recording = false;
    const take: Take = { stopped: false, final: false, afterFinal: false, end: () => {} };
    return {
      startRecording: (onFinished, onError) => {
        take.afterFinal = takes.every((t) => t.final);
        takes.push(take);
        take.end = (error) => {
          recording = false;
          const final = () => {
            take.final = true;
            if (error) onError(error);
            else onFinished(filePath);
          };
          if (finalizing) finalizing.push(final);
          else setImmediate(final);
        };
        return new Promise((started) =>
          setImmediate(() => {
            disk.add(filePath.slice(filePath.lastIndexOf('/') + 1));
            recording = true;
            started();
          }),
        );
      },
      stopRecording: async () => {
        if (!recording) throw new Error('Not currently recording!');
        take.stopped = true;
        take.end();
      },
    };
  },
};
// Lets the camcorder's promise chains and the fake's ticks settle.
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};
const stops = () => takes.map((t) => t.stopped);
afterEach(() => {
  takes.length = 0;
  disk.clear();
  written.length = 0;
});

describe('workoutSession', () => {
  it('opens the detector on start and closes it on stop', () => {
    const actor = createActor(workoutSession, { input: { challenge } }).start();
    expect(actor.getSnapshot().context.landmarker).toBe(native);
    actor.stop();
    expect(native.close).toHaveBeenCalledOnce();
  });

  it('writes each row with wall-clock boundaries from its first counting entry', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, { input: { challenge } }).start();
    vi.advanceTimersByTime(5000); // Setup time belongs to this step, before the first detector frame.
    squat();
    const view = () => sessionView(actor.getSnapshot());
    expect(view().results[0]).toMatchObject({
      exercise: 'squat',
      day: 1,
      round: 1,
      startedAt: NOW,
      endedAt: NOW + 5000,
      goal: reps(1),
      gauge: { down: 100, up: 160 },
      reps: 1,
      noReps: 0,
      heldMs: 0,
    });
    vi.advanceTimersByTime(2000); // Moving the phone is outside both exercise steps.
    actor.send({ type: 'next' });
    vi.advanceTimersByTime(3000);
    pushup();
    expect(view().results[1]).toMatchObject({
      exercise: 'pushup',
      startedAt: NOW + 7000,
      endedAt: NOW + 10000,
      heldMs: 0,
    });
    actor.stop();
  });

  it('keeps the first counting timestamp across pause and replaces it on restart', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, { input: { challenge: squatTest } }).start();
    vi.advanceTimersByTime(1000);
    squat();
    actor.send({ type: 'pause' });
    vi.advanceTimersByTime(5000);
    actor.send({ type: 'resume' });
    vi.advanceTimersByTime(1000);
    expect(actor.getSnapshot().context.stepStartedAt).toBe(NOW);
    actor.send({ type: 'pause' });
    actor.send({ type: 'restart' });
    squat();
    actor.send({ type: 'end' });
    expect(sessionView(actor.getSnapshot()).results[0]).toMatchObject({
      startedAt: NOW + 7000,
      endedAt: NOW + 7000,
      reps: 1,
    });
    actor.stop();
  });

  it('finishes a timed plank on detector time without advancing wall timers', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: { challenge: plan({ exercise: 'plank', goal: seconds(2) }) },
    }).start();
    hold(2400, plank({}));
    const view = sessionView(actor.getSnapshot());
    expect(view).toMatchObject({
      stage: 'finished',
      completed: true,
      started: true,
      unit: 'seconds',
      heldS: 2,
      goalS: 2,
      target: Infinity,
      elapsedS: 0,
      results: [
        {
          exercise: 'plank',
          day: 1,
          round: 1,
          goal: seconds(2),
          gauge: null,
          startedAt: NOW,
          endedAt: NOW,
          reps: 0,
          noReps: 0,
          attempts: [],
        },
      ],
    });
    expect(view.results[0].heldMs).toBeGreaterThanOrEqual(2000);
    expect(view.results[0].heldMs).toBeLessThanOrEqual(2400);
    expect(spoken()).toEqual(['Go', '2 seconds. Challenge done.']);
    actor.stop();
  });

  it('starts a fresh row timestamp when flipping inside counting', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, { input: { challenge: squatTest } }).start();
    vi.advanceTimersByTime(1000);
    actor.send({ type: 'flipCamera' });
    vi.advanceTimersByTime(5000);
    actor.send({ type: 'cameraReady' });
    squat();
    actor.send({ type: 'end' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      completed: false,
      results: [{ startedAt: NOW + 1000, endedAt: NOW + 6000 }],
    });
    actor.stop();
  });

  it('forgives a short max-hold break and a pause, then finishes on a long break', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: { challenge: plan({ exercise: 'plank', goal: MAX }) },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    hold(1000, plank({}));
    hold(500, plank({ sag: 40 }));
    hold(500, plank({}));
    expect(view()).toMatchObject({ stage: 'counting', started: true, results: [] });
    expect(actor.getSnapshot().context.plank.noReps).toBe(0);
    const heldMs = actor.getSnapshot().context.plank.heldMs;
    actor.send({ type: 'pause' });
    vi.advanceTimersByTime(5000);
    hold(1500, plank({ sag: 40 })); // Paused frames neither break nor add held time.
    actor.send({ type: 'resume' });
    expect(view()).toMatchObject({ stage: 'counting', phase: 'waiting', results: [] });
    expect(actor.getSnapshot().context.plank.heldMs).toBe(heldMs);
    hold(500, plank({}));
    expect(view()).toMatchObject({ stage: 'counting', phase: 'active', results: [] });
    hold(1500, plank({ sag: 40 }));
    expect(view()).toMatchObject({
      stage: 'finished',
      completed: true,
      flash: 'noRep',
      results: [
        {
          exercise: 'plank',
          goal: MAX,
          noReps: 1,
          attempts: [],
          startedAt: NOW,
          endedAt: NOW + 5000,
        },
      ],
    });
    expect(spoken()).toEqual(['Go', 'Keep your body straight. 2 seconds. Challenge done.']);
    actor.stop();
  });

  it('distinguishes a natural finish from ending early', () => {
    vi.useFakeTimers({ now: NOW });
    const natural = createActor(workoutSession, {
      input: { challenge: plan({ exercise: 'squat', goal: reps(1) }) },
    }).start();
    squat();
    expect(sessionView(natural.getSnapshot())).toMatchObject({
      stage: 'finished',
      completed: true,
    });
    natural.stop();

    const early = createActor(workoutSession, { input: { challenge } }).start();
    squat();
    early.send({ type: 'end' });
    expect(sessionView(early.getSnapshot())).toMatchObject({
      stage: 'finished',
      completed: false,
      results: [{ exercise: 'squat' }],
    });
    early.stop();
  });

  it('runs a squat set, waits between sets, then a push-up set', () => {
    const actor = createActor(workoutSession, { input: { challenge } }).start();
    squat();
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'switching',
      exercise: 'squat',
      name: 'squats',
      reps: 1,
      set: 1,
      sets: 2,
      nextGoal: reps(1),
      next: { name: 'push-ups' },
    });
    expect(spoken()).toEqual(['Go', '1, set done. Next, 1 push-ups. Turn the phone sideways.']);

    pushup(); // ignored: the phone is being moved
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'switching', reps: 1 });

    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'counting',
      exercise: 'pushup',
      name: 'push-ups',
      reps: 0,
      set: 2,
      next: null,
    });
    pushup();
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'finished', reps: 1 });
    expect(speak).toHaveBeenLastCalledWith('1. Challenge done.', expect.anything());
    expect(spoken()).toHaveLength(4); // and 'Go' for the push-up set
    actor.stop();
  });

  it('announces a seconds goal and a MAX goal when the preceding step ends', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'plank', goal: seconds(30) },
          { exercise: 'pushup', goal: MAX },
        ),
      },
    }).start();
    squat();
    expect(sessionView(actor.getSnapshot()).stage).toBe('switching');
    expect(spoken()).toEqual([
      'Go',
      '1, set done. Next, plank 30 seconds. Turn the phone sideways.',
    ]);

    actor.send({ type: 'next' });
    hold(30_500, plank({}));
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'countdown',
      countdown: 3,
      exercise: 'pushup',
      target: Infinity,
    });
    expect(spoken()).toEqual([
      'Go',
      '1, set done. Next, plank 30 seconds. Turn the phone sideways.',
      'Go',
      '30 seconds. Next, push-ups.',
    ]);
    actor.stop();
  });

  it('shows the next exercise across a rest and counts only exercise sets', () => {
    const actor = createActor(workoutSession, {
      input: {
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'rest', goal: seconds(30) },
          { exercise: 'pushup', goal: reps(3) },
        ),
      },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    expect(view()).toMatchObject({
      stage: 'counting',
      exercise: 'squat',
      set: 1,
      sets: 2,
      nextGoal: reps(3),
    });
    expect(view().next).toBe(EXERCISES.pushup);

    squat();
    expect(view()).toMatchObject({
      stage: 'resting',
      exercise: 'squat',
      set: 1,
      sets: 2,
      nextGoal: reps(3),
    });
    expect(view().next).toBe(EXERCISES.pushup);
    actor.stop();
  });

  it('walks expanded blocks and rounds, resetting the counter for each exercise step', () => {
    vi.useFakeTimers({ now: NOW });
    const repeated = defineChallenge({
      ...plan({ exercise: 'squat', goal: reps(1) }),
      session: [
        { steps: [{ exercise: 'squat', goal: reps(1) }], rounds: 2 },
        { steps: [{ exercise: 'pushup', goal: reps(2) }], rounds: 1 },
      ],
    });
    const actor = createActor(workoutSession, { input: { challenge: repeated } }).start();
    const view = () => sessionView(actor.getSnapshot());
    expect(view()).toMatchObject({ set: 1, sets: 3, target: 1 });
    squat();
    expect(view()).toMatchObject({ stage: 'countdown', set: 2, reps: 0, round: 2, rounds: 2 });
    vi.advanceTimersByTime(3000);
    expect(view()).toMatchObject({ stage: 'counting', set: 2, reps: 0, phase: 'waiting' });
    squat();
    expect(view()).toMatchObject({ stage: 'switching', set: 2, reps: 1 });
    actor.send({ type: 'next' });
    expect(view()).toMatchObject({ stage: 'counting', set: 3, target: 2, exercise: 'pushup' });
    pushup();
    expect(view()).toMatchObject({ stage: 'counting', reps: 1 });
    pushup();
    expect(view()).toMatchObject({
      stage: 'finished',
      next: null,
      results: [
        { exercise: 'squat', goal: reps(1), reps: 1, round: 1 },
        { exercise: 'squat', goal: reps(1), reps: 1, round: 2 },
        { exercise: 'pushup', goal: reps(2), reps: 2, round: 1 },
      ],
    });
    actor.stop();
  });

  it('counts down between the same placement without speaking 3 or counting detector frames', () => {
    vi.useFakeTimers({ now: NOW });
    const onPose = vi.fn();
    const actor = createActor(workoutSession, {
      input: {
        challenge: plan({ exercise: 'squat', goal: reps(1) }, { exercise: 'squat', goal: reps(1) }),
        onPose,
      },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    expect(view()).toMatchObject({
      stage: 'counting',
      countdown: null,
      rest: null,
      samePlacement: true,
    });
    squat();
    expect(view()).toMatchObject({
      stage: 'countdown',
      countdown: 3,
      unit: 'reps',
      goalS: Infinity,
      reps: 0,
      phase: 'waiting',
      set: 2,
      results: [{ exercise: 'squat', reps: 1 }],
    });
    expect(actor.getSnapshot().context.stepStartedAt).toBeNull();
    expect(spoken()).toEqual(['Go', '1. Next, 1 squats.']);
    squat();
    expect(view().reps).toBe(0);
    expect(onPose.mock.lastCall?.[1]).toEqual({ angle: null, lowest: null, joints: null });
    vi.advanceTimersByTime(1000);
    expect(view()).toMatchObject({ stage: 'countdown', countdown: 2 });
    vi.advanceTimersByTime(1000);
    expect(view()).toMatchObject({ stage: 'countdown', countdown: 1 });
    expect(spoken()).toEqual(['Go', '1. Next, 1 squats.', '2', '1']);
    vi.advanceTimersByTime(1000);
    expect(view()).toMatchObject({ stage: 'counting', countdown: null, phase: 'waiting' });
    squat();
    expect(view()).toMatchObject({
      stage: 'finished',
      completed: true,
      results: [
        { startedAt: NOW, endedAt: NOW },
        { startedAt: NOW + 3000, endedAt: NOW + 3000 },
      ],
    });
    expect(lockAsync.mock.calls).toEqual([[PORTRAIT], [PORTRAIT]]);
    actor.stop();
  });

  it('rests on wall time, exposes the next exercise, then counts down at the deadline', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'rest', goal: seconds(30) },
          { exercise: 'squat', goal: reps(2) },
        ),
      },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    squat();
    expect(view()).toMatchObject({
      stage: 'resting',
      rest: { leftS: 30 },
      countdown: null,
      samePlacement: true,
      exercise: 'squat',
      reps: 1,
      set: 1,
      sets: 2,
      nextGoal: reps(2),
    });
    expect(view().next).toBe(EXERCISES.squat);
    expect(view().nextGoal).toBe(actor.getSnapshot().context.steps[2].goal);
    expect(spoken()).toEqual(['Go', '1, set done. Rest 30 seconds.']);
    const rest = view().rest;
    squat();
    expect(view().rest).toBe(rest);
    expect(view().reps).toBe(1);
    actor.send({ type: 'pause' }); // Rest cannot be paused.
    vi.advanceTimersByTime(29_900);
    expect(view()).toMatchObject({ stage: 'resting', rest: { leftS: 1 }, elapsedS: 29 });
    vi.advanceTimersByTime(100);
    expect(view()).toMatchObject({
      stage: 'countdown',
      countdown: 3,
      rest: null,
      set: 2,
      reps: 0,
      elapsedS: 30,
    });
    expect(view().results).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(view().stage).toBe('counting');
    expect(actor.getSnapshot().context.stepStartedAt).toBe(NOW + 33_000);
    actor.stop();
  });

  it('skips a timed rest and cancels its old deadline', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'rest', goal: seconds(30) },
          { exercise: 'squat', goal: MAX },
        ),
      },
    }).start();
    squat();
    vi.advanceTimersByTime(1000);
    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'countdown', countdown: 3 });
    vi.advanceTimersByTime(29_000);
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'counting',
      results: [{ reps: 1 }],
    });
    expect(actor.getSnapshot().context.stepStartedAt).toBe(NOW + 4000);
    actor.stop();
  });

  it('keeps a MAX rest open until next, even after ten minutes', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'rest', goal: MAX },
          { exercise: 'squat', goal: reps(1) },
        ),
      },
    }).start();
    squat();
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'resting',
      rest: { leftS: null },
    });
    expect(spoken()).toEqual(['Go', '1, set done. Rest.']);
    vi.advanceTimersByTime(600_000);
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'resting',
      rest: { leftS: null },
    });
    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'countdown', countdown: 3 });
    actor.stop();
  });

  it('waits for phone placement after a rest and locks landscape only on Continue', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'rest', goal: seconds(30) },
          { exercise: 'pushup', goal: reps(1) },
        ),
      },
    }).start();
    squat();
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'resting',
      samePlacement: false,
    });
    vi.advanceTimersByTime(30_000);
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'switching',
      samePlacement: false,
      exercise: 'squat',
      next: { name: 'push-ups' },
      elapsedS: 30,
    });
    expect(actor.getSnapshot().context.stepS).toBe(30);
    expect(lockAsync.mock.calls).toEqual([[PORTRAIT]]);
    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'counting',
      exercise: 'pushup',
    });
    expect(lockAsync).toHaveBeenLastCalledWith(LANDSCAPE);
    pushup();
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'finished',
      completed: true,
      results: [{ exercise: 'squat' }, { exercise: 'pushup' }],
    });
    actor.stop();
  });

  it.each(['countdown', 'resting', 'paused'] as const)(
    'ends from %s without adding an unstarted row',
    (stage) => {
      vi.useFakeTimers({ now: NOW });
      const steps: [Step, ...Step[]] =
        stage === 'resting'
          ? [
              { exercise: 'squat', goal: reps(1) },
              { exercise: 'rest', goal: seconds(30) },
              { exercise: 'squat', goal: reps(1) },
            ]
          : [
              { exercise: 'squat', goal: reps(1) },
              { exercise: 'squat', goal: reps(1) },
            ];
      const actor = createActor(workoutSession, { input: { challenge: plan(...steps) } }).start();
      squat();
      if (stage === 'paused') actor.send({ type: 'pause' });
      expect(sessionView(actor.getSnapshot()).stage).toBe(stage);
      actor.send({ type: 'end' });
      vi.advanceTimersByTime(60_000);
      expect(sessionView(actor.getSnapshot())).toMatchObject({
        stage: 'finished',
        completed: false,
        results: [{ exercise: 'squat', reps: 1 }],
      });
      actor.stop();
    },
  );

  it('keeps the partial exercise row when ending directly from a counting pause', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, { input: { challenge: squatTest } }).start();
    vi.advanceTimersByTime(2000);
    squat();
    squat();
    actor.send({ type: 'pause' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'paused', reps: 2 });
    vi.advanceTimersByTime(5000);
    actor.send({ type: 'end' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'finished',
      completed: false,
      elapsedS: 2,
      results: [
        {
          exercise: 'squat',
          goal: MAX,
          startedAt: NOW,
          endedAt: NOW + 7000,
          reps: 2,
          noReps: 0,
          attempts: [{ counted: true }, { counted: true }],
        },
      ],
    });
    actor.stop();
  });

  it('skips the rest of a countdown on next and starts counting the next step', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        challenge: plan({ exercise: 'squat', goal: reps(1) }, { exercise: 'squat', goal: reps(1) }),
      },
    }).start();
    squat();
    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'counting', set: 2, reps: 0 });
    vi.advanceTimersByTime(3000); // The countdown timer left with the countdown state.
    squat();
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'finished', completed: true });
    actor.stop();
  });

  it('pauses a countdown and resumes directly into counting with a fresh start-position wait', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        challenge: plan({ exercise: 'squat', goal: reps(1) }, { exercise: 'squat', goal: reps(1) }),
      },
    }).start();
    squat();
    vi.advanceTimersByTime(1000);
    actor.send({ type: 'pause' });
    vi.advanceTimersByTime(10_000);
    squat();
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'paused',
      countdown: null,
      reps: 0,
    });
    actor.send({ type: 'resume' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'counting', phase: 'waiting' });
    expect(actor.getSnapshot().context.stepStartedAt).toBe(NOW + 11_000);
    vi.advanceTimersByTime(3000); // The countdown timer was cancelled by the pause.
    squat();
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'finished', completed: true });
    expect(spoken()).toEqual(['Go', '1. Next, 1 squats.', '2', 'Go', '1. Challenge done.']);
    actor.stop();
  });

  it('ends a set early on next while counting', () => {
    const actor = createActor(workoutSession, { input: { challenge } }).start();
    expect(sessionView(actor.getSnapshot())).toMatchObject({ recording: false, best: null });
    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'switching', reps: 0 });
    expect(speak).toHaveBeenCalledWith(
      '0, set done. Next, 1 push-ups. Turn the phone sideways.',
      expect.anything(),
    );
    actor.send({ type: 'next' });
    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot()).stage).toBe('finished');
    actor.stop();
  });

  it('locks landscape only after next, and portrait when finished and on stop', () => {
    const actor = createActor(workoutSession, { input: { challenge } }).start();
    expect(lockAsync.mock.calls).toEqual([[PORTRAIT]]);
    squat();
    expect(sessionView(actor.getSnapshot()).stage).toBe('switching');
    expect(lockAsync).toHaveBeenCalledTimes(1);
    actor.send({ type: 'next' });
    expect(lockAsync).toHaveBeenLastCalledWith(LANDSCAPE);
    actor.send({ type: 'end' });
    expect(lockAsync).toHaveBeenLastCalledWith(PORTRAIT);
    actor.stop();
    expect(lockAsync).toHaveBeenLastCalledWith(PORTRAIT);
    expect(lockAsync).toHaveBeenCalledTimes(4);
  });

  it('keeps the squat test open-ended, speaks each rep and hands every frame to the screen', () => {
    const onPose = vi.fn();
    const actor = createActor(workoutSession, { input: { challenge: squatTest, onPose } }).start();
    frames = 0;
    squat();
    squat();
    expect(onPose).toHaveBeenCalledTimes(frames);
    expect(spoken()).toEqual(['Go', '1', '2']);
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'counting',
      name: 'squats',
      reps: 2,
      target: Infinity,
      sets: 1,
    });
    const stats = () => EXERCISES.squat.stats(actor.getSnapshot().context.squat);
    expect(stats()).toMatch(/° · SYM \d+° · .*↓ .*↑ · LEAN \d+°/);
    actor.send({ type: 'pause' });
    actor.send({ type: 'restart' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({ reps: 0, phase: 'waiting' });
    expect(stats()).toBeNull();
    actor.stop();
  });

  it('hands the measured angle, depth so far and joints with every frame', () => {
    const onPose = vi.fn();
    const actor = createActor(workoutSession, { input: { challenge: squatTest, onPose } }).start();
    play(body({ thigh: 70, shin: 25 })); // crouched: not started
    expect(onPose.mock.lastCall?.[1]).toMatchObject({ lowest: null });
    play(body({}), body({ thigh: 70, shin: 25 }));
    const live = onPose.mock.lastCall?.[1];
    expect(live.angle).toBeCloseTo(85, 0);
    expect(live.lowest).toBeCloseTo(85, 0);
    expect(live.joints).toEqual([Joint.LEFT_HIP, Joint.LEFT_KNEE, Joint.LEFT_ANKLE]);
    actor.send({ type: 'pause' });
    play(body({}));
    expect(onPose.mock.lastCall?.[1]).toEqual({ angle: null, lowest: null, joints: null });
    actor.stop();
  });

  it('pauses, resumes, restarts and ends a set, timing only while counting', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, { input: { challenge: squatTest } }).start();
    const view = () => sessionView(actor.getSnapshot());
    vi.advanceTimersByTime(2000);
    squat();
    expect(view()).toMatchObject({ stage: 'counting', reps: 1, elapsedS: 2 });

    actor.send({ type: 'pause' });
    vi.advanceTimersByTime(5000);
    squat(); // not counted
    expect(view()).toMatchObject({ stage: 'paused', reps: 1, elapsedS: 2 });

    actor.send({ type: 'resume' });
    vi.advanceTimersByTime(1000);
    squat();
    expect(view()).toMatchObject({ stage: 'counting', reps: 2, elapsedS: 3 });

    actor.send({ type: 'pause' });
    actor.send({ type: 'restart' });
    expect(view()).toMatchObject({ stage: 'counting', reps: 0, attempts: [], call: null });
    squat();
    actor.send({ type: 'end' });
    vi.advanceTimersByTime(5000);
    expect(view()).toMatchObject({
      stage: 'finished',
      elapsedS: 3,
      completed: false,
      results: [{ name: 'squats', goal: MAX, reps: 1, noReps: 0 }],
    });
    expect(view().results[0].attempts).toHaveLength(1);
    actor.stop();
  });

  it('drops the rep in progress on pause, so resuming needs the start position again', () => {
    const actor = createActor(workoutSession, { input: { challenge: squatTest } }).start();
    play(body({}), body({ thigh: 70, shin: 25 })); // down, mid rep
    actor.send({ type: 'pause' });
    actor.send({ type: 'resume' }); // well inside the tracking timeout
    expect(sessionView(actor.getSnapshot()).phase).toBe('waiting');
    play(body({}));
    expect(actor.getSnapshot().context.squat).toMatchObject({ reps: 0, noReps: 0, phase: 'up' });
    expect(spoken()).toEqual(['Go', 'Go']);
    actor.stop();
  });

  it('keeps each finished set and the partial one on end', () => {
    const actor = createActor(workoutSession, { input: { challenge } }).start();
    squat();
    expect(sessionView(actor.getSnapshot()).results).toMatchObject([{ name: 'squats', reps: 1 }]);
    actor.send({ type: 'next' });
    actor.send({ type: 'end' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'finished',
      completed: false,
      results: [
        { exercise: 'squat', name: 'squats', reps: 1, attempts: [{ counted: true }] },
        { exercise: 'pushup', name: 'push-ups', reps: 0, attempts: [], stats: null },
      ],
    });
    actor.stop();

    const switching = createActor(workoutSession, { input: { challenge } }).start();
    squat();
    switching.send({ type: 'end' });
    expect(sessionView(switching.getSnapshot()).results).toHaveLength(1);
    switching.stop();
  });

  it('calls and flashes each rep and no-rep', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, { input: { challenge: squatTest } }).start();
    const view = () => sessionView(actor.getSnapshot());
    expect(view()).toMatchObject({ call: null, flash: null, gauge: { down: 100, up: 160 } });
    squat();
    expect(view()).toMatchObject({
      flash: 'rep',
      call: { counted: true },
      attempts: [{ counted: true }],
    });
    expect(view().call?.depth).toBeCloseTo(85, 0);
    vi.advanceTimersByTime(600);
    expect(view()).toMatchObject({ flash: null, call: { counted: true } });

    halfSquat();
    expect(view()).toMatchObject({
      flash: 'noRep',
      call: { counted: false, cue: 'Go deeper' },
      attempts: [{ counted: true }, { counted: false }],
    });
    vi.advanceTimersByTime(999);
    expect(view().flash).toBe('noRep');
    vi.advanceTimersByTime(1);
    expect(view().flash).toBeNull();
    actor.stop();
  });

  it('flashes and speaks a hold break without adding an attempt', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        challenge: plan({ exercise: 'plank', goal: seconds(60) }),
      },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    expect(view().started).toBe(false);
    hold(5000, plank({}));
    expect(actor.getSnapshot().context.plank.heldMs).toBeGreaterThanOrEqual(4600);
    hold(1000, plank({ sag: 40 }));
    expect(view()).toMatchObject({
      stage: 'counting',
      flash: 'noRep',
      attempts: [],
      caption: 'Keep your body straight',
      started: true,
    });
    expect(actor.getSnapshot().context.plank.noReps).toBe(1);
    expect(speak).toHaveBeenLastCalledWith('Keep your body straight', expect.anything());
    vi.advanceTimersByTime(999);
    expect(view().flash).toBe('noRep');
    vi.advanceTimersByTime(1);
    expect(view().flash).toBeNull();
    hold(500, plank({}));
    expect(spoken()).toEqual(['Go', 'Keep your body straight']);
    actor.send({ type: 'end' });
    expect(view().results).toMatchObject([{ exercise: 'plank', noReps: 1, attempts: [] }]);
    actor.stop();
  });

  it('captions every phrase but speaks none while muted', () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, { input: { challenge: squatTest } }).start();
    const view = () => sessionView(actor.getSnapshot());
    actor.send({ type: 'toggleVoice' });
    squat();
    expect(speak).not.toHaveBeenCalled();
    expect(view()).toMatchObject({ muted: true, caption: '1' });
    vi.advanceTimersByTime(2999);
    expect(view().caption).toBe('1');
    vi.advanceTimersByTime(1);
    expect(view().caption).toBeNull();
    actor.send({ type: 'toggleVoice' });
    squat();
    expect(spoken()).toEqual(['2']);
    actor.stop();
  });

  it('reports parts out of frame once stable, only while waiting', () => {
    const actor = createActor(workoutSession, { input: { challenge: squatTest } }).start();
    const view = () => sessionView(actor.getSnapshot());
    const crouched = body({ thigh: 70, shin: 25 }); // all in frame, not started
    hold(500, feetOut(body({})));
    hold(500, crouched);
    hold(500, feetOut(body({})));
    expect(view().missing).toEqual([]); // flicker never settles
    hold(600, headOut(body({ thigh: 70, shin: 25 }))); // crouched, so still waiting
    expect(view().missing).toEqual([]); // a different reading restarts the wait
    hold(1100, feetOut(body({}))); // a full second of frames from the restart
    const missing = view().missing;
    expect(missing).toEqual(['feet']);
    hold(1000, feetOut(body({})));
    expect(view().missing).toBe(missing); // same reference: no re-render per frame
    expect(spoken()).toEqual(['Your feet are out of frame']);
    play(body({}));
    expect(view()).toMatchObject({ phase: 'up', missing: [] });
    expect(spoken()).toEqual(['Your feet are out of frame', 'Go']);
    actor.stop();
  });

  it('keeps the count when the pose is lost mid-set, and carries on without "Go"', () => {
    const actor = createActor(workoutSession, { input: { challenge: squatTest } }).start();
    const view = () => sessionView(actor.getSnapshot());
    expect(view().started).toBe(false);
    squat();
    hold(2500, feetOut(body({ thigh: 70, shin: 25 }))); // walked up to the phone, crouched
    expect(view()).toMatchObject({ phase: 'waiting', started: true, reps: 1, missing: ['feet'] });
    play(body({}));
    squat();
    expect(view()).toMatchObject({ phase: 'up', started: true, reps: 2 });
    expect(spoken()).toEqual(['Go', '1', 'Your feet are out of frame', '2']);
    actor.stop();
  });

  it('toggles the skeleton and flips the camera only before the first attempt or from paused', () => {
    const actor = createActor(workoutSession, { input: { challenge } }).start();
    const view = () => sessionView(actor.getSnapshot());
    const noReps = () => actor.getSnapshot().context.squat.noReps;
    expect(view()).toMatchObject({ skeleton: true, camera: 'front' });
    actor.send({ type: 'toggleSkeleton' });
    actor.send({ type: 'flipCamera' });
    expect(view()).toMatchObject({ skeleton: false, camera: 'back' });
    actor.send({ type: 'cameraReady' });
    play(body({}), body({ thigh: 25, shin: 20 }), body({})); // a no-rep
    actor.send({ type: 'flipCamera' }); // ignored mid-set
    expect(view()).toMatchObject({ camera: 'back', started: true });
    expect(noReps()).toBe(1);
    actor.send({ type: 'pause' });
    actor.send({ type: 'flipCamera' }); // restarts the set
    expect(view()).toMatchObject({ stage: 'counting', camera: 'front', started: false });
    expect(noReps()).toBe(0);
    actor.stop();
  });

  it('ignores frames after a flip until the new camera streams, so old frames neither count nor film', async () => {
    const onPose = vi.fn();
    const actor = createActor(workoutSession, {
      input: { challenge: squatTest, video, onPose },
    }).start();
    const view = () => sessionView(actor.getSnapshot());
    actor.send({ type: 'flipCamera' });
    squat(); // the old camera's frames, still in flight
    await flush();
    expect(view()).toMatchObject({ reps: 0, phase: 'waiting', started: false, recording: false });
    expect(takes).toHaveLength(0);
    expect(onPose.mock.lastCall?.[1]).toEqual({ angle: null, lowest: null, joints: null }); // dots still drawn
    actor.send({ type: 'cameraReady' });
    squat();
    await flush();
    expect(view()).toMatchObject({ reps: 1, recording: true });
    actor.stop();
  });

  it('keeps waiting for the new camera when a flip is paused and resumed before it streams', async () => {
    const actor = createActor(workoutSession, { input: { challenge: squatTest, video } }).start();
    const view = () => sessionView(actor.getSnapshot());
    actor.send({ type: 'flipCamera' });
    actor.send({ type: 'pause' });
    actor.send({ type: 'resume' });
    squat(); // still the old camera's frames
    await flush();
    expect(view()).toMatchObject({ reps: 0, recording: false });
    expect(takes).toHaveLength(0);
    actor.send({ type: 'cameraReady' });
    squat();
    await flush();
    expect(view()).toMatchObject({ reps: 1, recording: true });
    actor.stop();
  });

  it('films each set from the start position and keeps only the best rep file', async () => {
    const actor = createActor(workoutSession, { input: { challenge, video } }).start();
    const view = () => sessionView(actor.getSnapshot());
    // `best` must only land once every file is final.
    let finalWhenBest: boolean | undefined;
    actor.subscribe(({ context }) => {
      if (context.best && finalWhenBest === undefined) finalWhenBest = takes.every((t) => t.final);
    });
    play(body({ thigh: 70, shin: 25 })); // crouched: still waiting, nothing filmed
    await flush();
    expect(takes).toHaveLength(0);

    play(body({})); // standing: counting starts
    await flush();
    expect(view().recording).toBe(true);
    const start = clock;
    play(body({ thigh: 70, shin: 25 }), body({}));
    expect(view()).toMatchObject({ stage: 'switching', recording: false });
    expect(stops()).toEqual([true]);
    const squatClip = view().results[0].attempts[0].clip;
    // The bottom lies in the 1.5 s crouch that followed the take's first frame.
    expect(squatClip?.atMs).toBeGreaterThan(0);
    expect(squatClip?.atMs).toBeLessThanOrEqual(clock - start - 1500);

    actor.send({ type: 'next' });
    play(plank({ elbow: 170 }));
    await flush();
    play(plank({ elbow: 80 }), plank({ elbow: 170 }));
    expect(view()).toMatchObject({ stage: 'finished', best: null }); // files not final yet
    expect(disk.size).toBe(2);
    await flush();
    // The squat went further past its 100° than the push-up past its 90°, though its angle is larger.
    const [squatSet, pushupSet] = view().results;
    expect(squatSet.attempts[0].depth - (squatSet.gauge?.down ?? 0)).toBeLessThan(
      pushupSet.attempts[0].depth - (pushupSet.gauge?.down ?? 0),
    );
    expect(view().best).toMatchObject({ ...squatClip, exercise: 'squat', name: 'squats', rep: 1 });
    expect(finalWhenBest).toBe(true);
    expect([...disk].map((name) => `file:///cache/reps/${name}`)).toEqual([squatClip?.uri]);
    expect(view().best).toBe(view().best); // stable for shallowEqual
    actor.stop();
    await flush();
    expect(disk.size).toBe(1); // the best file outlives the screen, for sharing

    // The next session deletes it before filming.
    createActor(workoutSession, { input: { challenge, video } }).start().stop();
    expect(disk.size).toBe(0);
  });

  it('cuts the take on pause, films again once back in position and deletes all files when left early', async () => {
    const actor = createActor(workoutSession, { input: { challenge: squatTest, video } }).start();
    const view = () => sessionView(actor.getSnapshot());
    play(body({}));
    await flush();
    expect(view().recording).toBe(true);
    actor.send({ type: 'pause' });
    expect(view().recording).toBe(false);
    expect(stops()).toEqual([true]);
    actor.send({ type: 'resume' });
    await flush();
    expect(view()).toMatchObject({ phase: 'waiting', recording: false }); // the waiting screen
    expect(takes).toHaveLength(1);
    play(body({}));
    await flush();
    expect(view().recording).toBe(true);
    expect(stops()).toEqual([true, false]);
    expect(disk.size).toBe(2);
    actor.stop();
    expect(takes[1].stopped).toBe(true);
    await flush();
    expect(disk.size).toBe(0);
  });

  it('starts a take only once the previous file is final, even on a quick pause and resume', async () => {
    const actor = createActor(workoutSession, { input: { challenge: squatTest, video } }).start();
    play(body({}));
    await flush();
    actor.send({ type: 'pause' });
    actor.send({ type: 'resume' });
    play(body({})); // rolls while the first file is still being written
    await flush();
    expect(sessionView(actor.getSnapshot()).recording).toBe(true);
    expect(takes.map((t) => t.afterFinal)).toEqual([true, true]);
    actor.stop();
  });

  it('deletes a file that appears after leaving', async () => {
    const actor = createActor(workoutSession, { input: { challenge: squatTest, video } }).start();
    play(body({}));
    for (let i = 0; i < 50 && !takes.length; i++) await Promise.resolve(); // starting, no file yet
    actor.stop();
    expect(disk.size).toBe(0);
    await flush(); // the file appears, is finalized, then deleted
    expect(takes).toMatchObject([{ final: true }]);
    expect(disk.size).toBe(0);
  });

  it('cleans up only its own files when it finalizes after the next session started', async () => {
    const actor = createActor(workoutSession, { input: { challenge: squatTest, video } }).start();
    play(body({}));
    await flush();
    const slow: (() => void)[] = [];
    finalizing = slow; // CameraX is slow to finalize this session's file
    actor.send({ type: 'end' });
    actor.stop();
    finalizing = null;

    const next = createActor(workoutSession, { input: { challenge: squatTest, video } }).start();
    play(body({}));
    await flush();
    expect(sessionView(next.getSnapshot()).recording).toBe(true);
    slow.forEach((final) => final());
    await flush();
    expect(takes.map((t) => t.final)).toEqual([true, false]);
    expect(disk.size).toBe(1); // the next session's take
    next.stop();
  });

  it('never clips a rep from a failed take, nor after a take the OS ended', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const actor = createActor(workoutSession, { input: { challenge: squatTest, video } }).start();
    const view = () => sessionView(actor.getSnapshot());
    play(body({}));
    await flush();
    squat();
    expect(view().attempts[0].clip).toBeDefined();
    takes[0].end(new Error('encoder')); // the encoder fails: the file is unusable
    await flush();
    expect(view()).toMatchObject({ recording: false, attempts: [{ counted: true, cue: null }] });
    expect(view().attempts[0].clip).toBeUndefined();
    squat();
    expect(view().attempts[1].clip).toBeUndefined();
    actor.stop();
    await flush();

    const ended = createActor(workoutSession, { input: { challenge: squatTest, video } }).start();
    play(body({}));
    await flush();
    squat();
    takes[1].end(); // the OS finalizes the file early, e.g. on backgrounding
    await flush();
    expect(sessionView(ended.getSnapshot()).recording).toBe(false);
    squat();
    ended.send({ type: 'end' });
    await flush();
    const { results, best } = sessionView(ended.getSnapshot());
    expect(results[0].attempts.map((a) => a.clip !== undefined)).toEqual([true, false]);
    expect(best).toMatchObject({ rep: 1 });
    expect(warn).toHaveBeenCalledWith('[camcorder] recording failed', expect.any(Error));
    ended.stop();
    warn.mockRestore();
  });

  it('does not clip a rep whose bottom came before the take started', async () => {
    const actor = createActor(workoutSession, { input: { challenge: squatTest, video } }).start();
    play(body({}), body({ thigh: 70, shin: 25 })); // the take is still starting through the bottom
    await flush();
    play(body({}));
    const { attempts, recording } = sessionView(actor.getSnapshot());
    expect(recording).toBe(true);
    expect(attempts).toEqual([expect.objectContaining({ counted: true })]);
    expect(attempts[0].clip).toBeUndefined();
    actor.stop();
  });

  it('wraps up without waiting on takes that never start once the camera drops video', async () => {
    let starts = 0;
    // An unbound output: the recorder is created, but its recording never starts.
    const unbound: VideoOutput = {
      createRecorder: async () => ({
        startRecording: () => {
          starts++;
          return new Promise(() => {});
        },
        stopRecording: async () => {},
      }),
    };
    let wrapped = false;
    const actor = createActor(workoutSession, {
      input: { challenge: squatTest, video: unbound },
      inspect: (e) => {
        if (e.type === '@xstate.event' && e.event.type === 'wrapped') wrapped = true;
      },
    }).start();
    play(body({}));
    await flush();
    expect(starts).toBe(1);
    actor.send({ type: 'videoLost' });
    actor.send({ type: 'pause' });
    actor.send({ type: 'resume' });
    play(body({})); // rolls again: a no-op now
    squat();
    actor.send({ type: 'end' });
    await flush();
    expect(starts).toBe(1);
    expect(wrapped).toBe(true);
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'finished',
      results: [{ reps: 1 }],
    });
    actor.stop();
  });

  it('deletes the file of a given-up take whose start lands after the session left', async () => {
    let begin = () => {};
    let finish = () => {};
    // The start is in flight when the output drops; it resolves only after cleanup ran.
    const late: VideoOutput = {
      createRecorder: async ({ filePath = '' }) => ({
        startRecording: (onFinished) =>
          new Promise<void>((resolve) => {
            begin = () => {
              disk.add(filePath.split('/').pop() ?? '');
              finish = () => onFinished(filePath);
              resolve();
            };
          }),
        stopRecording: async () => finish(),
      }),
    };
    const actor = createActor(workoutSession, {
      input: { challenge: squatTest, video: late },
    }).start();
    play(body({}));
    await flush();
    actor.send({ type: 'videoLost' });
    actor.send({ type: 'end' });
    await flush();
    actor.stop();
    await flush();
    begin(); // the recording starts after all, writes its file, and is stopped at once
    expect(disk.size).toBe(1);
    await flush();
    expect(disk.size).toBe(0);
  });

  it('counts as before when the camera cannot record', async () => {
    const broken: VideoOutput = { createRecorder: () => Promise.reject(new Error('unbound')) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const actor = createActor(workoutSession, {
      input: { challenge: squatTest, video: broken },
    }).start();
    play(body({}));
    await flush();
    squat();
    actor.send({ type: 'end' });
    await flush();
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'finished',
      results: [{ reps: 1 }],
      recording: false,
      best: null,
    });
    expect(warn).toHaveBeenCalled();
    actor.stop();
    warn.mockRestore();
  });
});

describe('dev pose recorder', () => {
  it('keeps a trace readable after a long pause between short counting stretches', async () => {
    const actor = createActor(workoutSession, {
      input: { challenge: squatTest, record: true },
    }).start();
    const pose = body({});
    for (const timestampMs of [1000, 1066])
      native.onResult?.({ ...pose, timestampMs, cameraLandmarks: [] });
    actor.send({ type: 'pause' });
    native.onResult?.({ ...pose, timestampMs: 15000, cameraLandmarks: [] });
    actor.send({ type: 'resume' });
    for (const timestampMs of [31000, 31066])
      native.onResult?.({ ...pose, timestampMs, cameraLandmarks: [] });
    actor.send({ type: 'end' });
    await flush();
    expect(written).toHaveLength(1);
    const trace = parseTrace(JSON.parse(written[0].text));
    expect(trace.frames.map((frame) => frame.t)).toEqual([0, 66, 30000, 30066]);
    expect(trace.fps).toBe(1);
    actor.stop();
  });

  it('drops duplicate and decreasing detector timestamps to keep the trace readable', async () => {
    const actor = createActor(workoutSession, {
      input: { challenge: squatTest, record: true },
    }).start();
    const pose = body({});
    for (const timestampMs of [1000, 1000, 990, 1066, 1066, 1033, 1132])
      native.onResult?.({ ...pose, timestampMs, cameraLandmarks: [] });
    actor.send({ type: 'end' });
    await flush();
    expect(written).toHaveLength(1);
    const trace = parseTrace(JSON.parse(written[0].text));
    expect(trace.frames.map((frame) => frame.t)).toEqual([0, 66, 132]);
    actor.stop();
  });

  it('writes a readable single-frame trace with the fallback frame rate', async () => {
    const actor = createActor(workoutSession, {
      input: { challenge: squatTest, record: true },
    }).start();
    native.onResult?.({ ...body({}), timestampMs: 1000, cameraLandmarks: [] });
    actor.send({ type: 'end' });
    await flush();
    expect(written).toHaveLength(1);
    const trace = parseTrace(JSON.parse(written[0].text));
    expect(trace.fps).toBe(15);
    expect(trace.frames).toHaveLength(1);
    expect(trace.frames[0].t).toBe(0);
    actor.stop();
  });

  it.each(['directory creation', 'file write'])(
    'warns on failed %s and continues counting and recording the next step',
    async (operation) => {
      const error = new Error(`${operation} failed`);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      if (operation === 'directory creation')
        createDirectory.mockImplementationOnce(() => {
          throw error;
        });
      else writeFile.mockRejectedValueOnce(error);
      const actor = createActor(workoutSession, {
        input: { challenge, record: true },
      }).start();
      squat();
      await flush();
      expect(written).toEqual([]);
      expect(warn).toHaveBeenCalledExactlyOnceWith('[recorder] could not write', error);
      expect(sessionView(actor.getSnapshot())).toMatchObject({
        stage: 'switching',
        results: [{ exercise: 'squat', reps: 1 }],
      });
      actor.send({ type: 'next' });
      const started = frames;
      pushup();
      await flush();
      expect(sessionView(actor.getSnapshot())).toMatchObject({
        stage: 'finished',
        completed: true,
        results: [{ reps: 1 }, { reps: 1 }],
      });
      expect(written).toHaveLength(1);
      const trace = parseTrace(JSON.parse(written[0].text));
      expect(trace.exercise).toBe('pushup');
      expect(trace.frames.length).toBeLessThanOrEqual(frames - started);
      expect(replay(EXERCISES.pushup, trace).reps).toBe(1);
      expect(warn).toHaveBeenCalledOnce();
      actor.stop();
    },
  );

  it('writes a replayable Trace v1 with the counter’s two reps on End', async () => {
    const actor = createActor(workoutSession, {
      input: { challenge: squatTest, record: true },
    }).start();
    squat();
    squat();
    actor.send({ type: 'end' });
    await flush();
    expect(written).toHaveLength(1);
    const { name, text } = written[0];
    const trace = parseTrace(JSON.parse(text));
    expect(name).toMatch(/^squat-\d+\.json$/);
    expect(trace).toMatchObject({
      version: 1,
      source: {
        dataset: 'superhabit-dev',
        clip: name,
        url: '',
        license: 'private recording, no redistribution',
      },
      exercise: 'squat',
      labels: { reps: 2 },
      fps: 15,
    });
    expect(trace.frames[0].t).toBe(0);
    expect(trace.frames.every((frame, i) => i === 0 || frame.t > trace.frames[i - 1].t)).toBe(true);
    expect(trace.frames.every((frame) => frame.landmarks.length === 33)).toBe(true);
    expect(
      trace.frames.every((frame) => frame.landmarks.every((point) => point.length === 4)),
    ).toBe(true);
    expect(createDirectory).toHaveBeenCalledExactlyOnceWith({
      intermediates: true,
      idempotent: true,
    });
    expect(replay(EXERCISES.squat, trace).reps).toBe(2);
    actor.stop();
  });

  it('drops the previous buffer on restart and starts the new trace at zero', async () => {
    const actor = createActor(workoutSession, {
      input: { challenge: squatTest, record: true },
    }).start();
    const before = frames;
    squat();
    actor.send({ type: 'pause' });
    actor.send({ type: 'restart' });
    const restarted = frames;
    squat();
    actor.send({ type: 'end' });
    await flush();
    expect(written).toHaveLength(1);
    const trace = parseTrace(JSON.parse(written[0].text));
    expect(trace.labels).toEqual({ reps: 1 });
    expect(trace.frames[0].t).toBe(0);
    expect(trace.frames).toHaveLength(frames - restarted);
    expect(trace.frames.length).toBeLessThan(frames - before);
    expect(replay(EXERCISES.squat, trace).reps).toBe(1);
    actor.stop();
  });

  it('does not create a directory or write files without record enabled', async () => {
    const actor = createActor(workoutSession, { input: { challenge } }).start();
    squat(); // Natural completion must also leave the recorder disabled.
    actor.send({ type: 'next' });
    pushup();
    await flush();
    expect(written).toEqual([]);
    expect(createDirectory).not.toHaveBeenCalled();
    actor.stop();
  });

  it('writes held milliseconds on natural completion of a two-second plank', async () => {
    const actor = createActor(workoutSession, {
      input: { challenge: plan({ exercise: 'plank', goal: seconds(2) }), record: true },
    }).start();
    hold(2400, plank({}));
    await flush();
    expect(written).toHaveLength(1);
    const trace = parseTrace(JSON.parse(written[0].text));
    expect(trace.exercise).toBe('plank');
    expect(trace.labels.holdMs).toBeGreaterThanOrEqual(2000);
    expect(trace.labels).toEqual({ holdMs: sessionView(actor.getSnapshot()).results[0].heldMs });
    expect(replay(EXERCISES.plank, trace).heldMs).toBe(trace.labels.holdMs);
    actor.stop();
  });

  it('keeps only counting frames across a pause and saves once when ended while paused', async () => {
    const actor = createActor(workoutSession, {
      input: { challenge: squatTest, record: true },
    }).start();
    const started = frames;
    squat();
    const paused = frames;
    actor.send({ type: 'pause' });
    hold(2500, body({ thigh: 70, shin: 25 }));
    const resumed = frames;
    actor.send({ type: 'resume' });
    squat();
    actor.send({ type: 'pause' });
    actor.send({ type: 'end' });
    await flush();
    expect(written).toHaveLength(1);
    const trace = parseTrace(JSON.parse(written[0].text));
    expect(trace.frames).toHaveLength(paused - started + frames - resumed);
    expect(trace.labels).toEqual({ reps: 2 });
    expect(replay(EXERCISES.squat, trace).reps).toBe(2);
    actor.stop();
  });

  it.each([false, true])('drops frames on a camera flip, from paused: %s', async (paused) => {
    const actor = createActor(workoutSession, {
      input: { challenge: squatTest, record: true },
    }).start();
    if (paused) {
      squat();
      actor.send({ type: 'pause' });
    } else {
      play(body({})); // Before the first attempt a flip is allowed while counting.
    }
    actor.send({ type: 'flipCamera' });
    squat(); // Old camera frames must never enter the new buffer.
    actor.send({ type: 'cameraReady' });
    const ready = frames;
    squat();
    actor.send({ type: 'end' });
    await flush();
    expect(written).toHaveLength(1);
    const trace = parseTrace(JSON.parse(written[0].text));
    expect(trace.frames).toHaveLength(frames - ready);
    expect(trace.frames[0].t).toBe(0);
    expect(trace.labels).toEqual({ reps: 1 });
    expect(replay(EXERCISES.squat, trace).reps).toBe(1);
    actor.stop();
  });

  it('keeps successive steps separate and excludes rest and countdown frames', async () => {
    vi.useFakeTimers({ now: NOW });
    const actor = createActor(workoutSession, {
      input: {
        challenge: plan(
          { exercise: 'squat', goal: reps(1) },
          { exercise: 'rest', goal: seconds(30) },
          { exercise: 'squat', goal: MAX },
        ),
        record: true,
      },
    }).start();
    squat();
    expect(written).toHaveLength(1);
    expect(sessionView(actor.getSnapshot()).stage).toBe('resting');
    squat(); // All of these frames belong to rest.
    vi.advanceTimersByTime(30000);
    expect(sessionView(actor.getSnapshot()).stage).toBe('countdown');
    squat(); // All of these frames belong to countdown.
    vi.advanceTimersByTime(3000);
    const started = frames;
    play(body({}));
    actor.send({ type: 'end' });
    expect(written).toHaveLength(2);
    const first = parseTrace(JSON.parse(written[0].text));
    const second = parseTrace(JSON.parse(written[1].text));
    expect(first.labels).toEqual({ reps: 1 });
    expect(replay(EXERCISES.squat, first).reps).toBe(1);
    expect(second.frames).toHaveLength(frames - started);
    expect(second.frames[0].t).toBe(0);
    expect(second.labels).toEqual({ reps: 0 });
    actor.stop();
  });

  it('writes nothing when a step has no counting frames', async () => {
    const actor = createActor(workoutSession, {
      input: { challenge: squatTest, record: true },
    }).start();
    actor.send({ type: 'end' });
    await flush();
    expect(written).toEqual([]);
    expect(createDirectory).not.toHaveBeenCalled();
    actor.stop();
  });
});
