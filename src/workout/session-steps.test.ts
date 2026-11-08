import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { createActor } from 'xstate';

import { defineChallenge, MAX, reps, seconds, type Step } from './plan';
import { EXERCISES } from '@/exercises/registry';

import { plank } from '@/exercises/__fixtures__/plank';
import {
  challenge,
  hold,
  LANDSCAPE,
  lockAsync,
  modules,
  NOW,
  plan,
  PORTRAIT,
  pushup,
  reset,
  speak,
  spoken,
  squat,
  squatTest,
} from './__fixtures__/session';

vi.mock('superhabit-pose', () => modules['superhabit-pose']);
vi.mock('expo-speech', () => modules['expo-speech']);
vi.mock('expo-file-system', () => modules['expo-file-system']);
vi.mock('expo-screen-orientation', () => modules['expo-screen-orientation']);

const { workoutSession } = await import('./session');
const { sessionView } = await import('./session-view');

afterEach(reset);

describe('workoutSession moves between steps: sets, rests, countdowns, phone placement', () => {
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

  it('reports after every set how much of the session is done, so a killed app keeps it', () => {
    const onSaved = vi.fn();
    const full = createActor(workoutSession, { input: { challenge, onSaved } }).start();
    squat();
    // Before the last set: the squat set is already reported.
    expect(onSaved.mock.calls).toEqual([[0.5, [1, 0]]]);
    full.send({ type: 'next' });
    pushup();
    expect(onSaved.mock.calls).toEqual([
      [0.5, [1, 0]],
      [1, [1, 1]],
    ]);
    full.stop();

    onSaved.mockClear();
    const cut = createActor(workoutSession, { input: { challenge, onSaved } }).start();
    squat();
    cut.send({ type: 'end' });
    // Ending between sets adds no set, so nothing new to report.
    expect(onSaved.mock.calls).toEqual([[0.5, [1, 0]]]);
    cut.stop();
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
    expect(sessionView(actor.getSnapshot())).toMatchObject({ recording: false });
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
});
