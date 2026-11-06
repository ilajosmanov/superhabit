import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';
import { createActor } from 'xstate';

import { defineChallenge, MAX, reps, seconds, type Step } from './plan';
import { EXERCISES } from '@/exercises/registry';
import { body } from '@/exercises/__fixtures__/body';
import { plank } from '@/exercises/__fixtures__/plank';
import {
  challenge,
  feetOut,
  flush,
  frames,
  halfSquat,
  headOut,
  hold,
  LANDSCAPE,
  lockAsync,
  modules,
  native,
  NOW,
  plan,
  play,
  PORTRAIT,
  pushup,
  reset,
  speak,
  spoken,
  squat,
  squatTest,
  takes,
  video,
} from './__fixtures__/session';

vi.mock('superhabit-pose', () => modules['superhabit-pose']);
vi.mock('expo-speech', () => modules['expo-speech']);
vi.mock('expo-file-system', () => modules['expo-file-system']);
vi.mock('expo-screen-orientation', () => modules['expo-screen-orientation']);

const { workoutSession } = await import('./session');
const { sessionView } = await import('./session-view');

afterEach(reset);

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
      round: 1,
      startedAt: NOW,
      endedAt: NOW + 5000,
      goal: reps(1),
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
      reachedEnd: true,
      started: true,
      unit: 'seconds',
      heldS: 2,
      goalS: 2,
      target: Infinity,
      elapsedS: 0,
      results: [
        {
          exercise: 'plank',
          round: 1,
          goal: seconds(2),
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
      reachedEnd: false,
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
      reachedEnd: true,
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
      reachedEnd: true,
    });
    natural.stop();

    const early = createActor(workoutSession, { input: { challenge } }).start();
    squat();
    early.send({ type: 'end' });
    expect(sessionView(early.getSnapshot())).toMatchObject({
      stage: 'finished',
      reachedEnd: false,
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
    expect(view()).toMatchObject({ stage: 'countdown', set: 2, reps: 0 });
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
      restLeftS: null,
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
      reachedEnd: true,
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
      restLeftS: 30,
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
    squat();
    expect(view().restLeftS).toBe(30);
    expect(view().reps).toBe(1);
    actor.send({ type: 'pause' }); // Rest cannot be paused.
    vi.advanceTimersByTime(29_900);
    expect(view()).toMatchObject({ stage: 'resting', restLeftS: 1, elapsedS: 29 });
    vi.advanceTimersByTime(100);
    expect(view()).toMatchObject({
      stage: 'countdown',
      countdown: 3,
      restLeftS: null,
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
      restLeftS: null,
    });
    expect(spoken()).toEqual(['Go', '1, set done. Rest.']);
    vi.advanceTimersByTime(600_000);
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'resting',
      restLeftS: null,
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
      reachedEnd: true,
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
        reachedEnd: false,
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
      reachedEnd: false,
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
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'finished', reachedEnd: true });
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
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'finished', reachedEnd: true });
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
    const before = frames;
    squat();
    squat();
    expect(onPose).toHaveBeenCalledTimes(frames - before);
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
      reachedEnd: false,
      results: [{ exercise: 'squat', goal: MAX, reps: 1, noReps: 0 }],
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
    expect(sessionView(actor.getSnapshot()).results).toMatchObject([
      { exercise: 'squat', reps: 1 },
    ]);
    actor.send({ type: 'next' });
    actor.send({ type: 'end' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'finished',
      reachedEnd: false,
      results: [
        { exercise: 'squat', reps: 1, attempts: [{ counted: true }] },
        { exercise: 'pushup', reps: 0, attempts: [], stats: null },
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

  it('shows every part out of frame until the first detector frame', () => {
    const actor = createActor(workoutSession, { input: { challenge: squatTest } }).start();
    const view = () => sessionView(actor.getSnapshot());
    expect(view().missing).toEqual(['head', 'hips', 'feet']);
    hold(100, body({}));
    expect(view().missing).toEqual([]);
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
});
