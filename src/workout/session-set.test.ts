import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { Joint } from 'superhabit-pose/joints';
import { createActor } from 'xstate';

import { MAX, seconds } from './plan';
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
  modules,
  NOW,
  plan,
  play,
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

describe('workoutSession inside a set: frames, reps, pause, coaching, framing, camera flip', () => {
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
