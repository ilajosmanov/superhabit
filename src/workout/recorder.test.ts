import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createActor } from 'xstate';

import { MAX, reps, seconds } from './plan';
import { EXERCISES } from '@/exercises/registry';
import { body } from '@/exercises/__fixtures__/body';
import { plank } from '@/exercises/__fixtures__/plank';
import { replay } from '@/exercises/__fixtures__/replay';
import { parseTrace } from '@/exercises/trace';
import {
  challenge,
  createDirectory,
  files,
  moveFile,
  flush,
  frames,
  hold,
  modules,
  native,
  NOW,
  plan,
  play,
  pushup,
  reset,
  squat,
  squatTest,
  writeFile,
  written,
} from './__fixtures__/session';

vi.mock('superhabit-pose', () => modules['superhabit-pose']);
vi.mock('expo-speech', () => modules['expo-speech']);
vi.mock('expo-file-system', () => modules['expo-file-system']);
vi.mock('expo-screen-orientation', () => modules['expo-screen-orientation']);

const { workoutSession } = await import('./session');
const { sessionView } = await import('./session-view');

afterEach(reset);

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
        reachedEnd: true,
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

  it('drops frames on a camera flip', async () => {
    const actor = createActor(workoutSession, {
      input: { challenge: squatTest, record: true },
    }).start();
    play(body({})); // Before the first attempt a flip is allowed while counting.
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

describe('sharing traces', () => {
  const where = () => [...files].map((path) => path.split('/').slice(0, 2).join('/'));
  // One squat set, then End: the Done screen with one trace written.
  const finished = async () => {
    const actor = createActor(workoutSession, {
      input: { challenge: squatTest, record: true },
    }).start();
    squat();
    actor.send({ type: 'end' });
    await flush();
    return actor;
  };

  // Close and Back both stop the session; the switch's last position decides.
  it.each([
    { switches: [], kept: [] },
    { switches: [true], kept: ['document/traces'] },
    { switches: [true, false], kept: [] },
  ])(
    'after switching $switches, keeps $kept once the session stops',
    async ({ switches, kept }) => {
      const actor = await finished();
      expect(where()).toEqual(['cache/traces']);
      for (const share of switches) actor.send({ type: 'shareTraces', share });
      actor.stop();
      await flush();
      expect(where()).toEqual(kept);
    },
  );

  it('lets every move finish before deleting the folder when one fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let land = () => {};
    moveFile
      .mockRejectedValueOnce(new Error('no space'))
      .mockImplementationOnce(() => new Promise<void>((resolve) => (land = resolve)));
    const actor = createActor(workoutSession, {
      input: { challenge, record: true },
    }).start();
    squat();
    actor.send({ type: 'next' });
    pushup();
    await flush();
    actor.send({ type: 'shareTraces', share: true });
    actor.stop();
    await flush();
    land();
    await flush();
    expect(where()).toEqual(['document/traces']);
  });

  it('settles a write still landing before keeping or deleting', async () => {
    let land = () => {};
    writeFile.mockImplementationOnce(() => new Promise<void>((resolve) => (land = resolve)));
    const actor = await finished();
    actor.stop();
    await flush();
    land();
    await flush();
    expect(files.size).toBe(0);
  });

  it('shares only the session that was shared', async () => {
    const first = await finished();
    first.stop();
    const second = await finished();
    second.send({ type: 'shareTraces', share: true });
    second.stop();
    await flush();
    expect(where()).toEqual(['document/traces']);
  });

  it('sweeps a folder a killed app left, not one still settling', async () => {
    files.add('cache/traces/old/squat-1.json');
    let land = () => {};
    writeFile.mockImplementationOnce(() => new Promise<void>((resolve) => (land = resolve)));
    const first = await finished();
    first.send({ type: 'shareTraces', share: true });
    first.stop();
    const second = createActor(workoutSession, {
      input: { challenge: squatTest, record: true },
    }).start();
    land();
    await flush();
    expect(where()).toEqual(['document/traces']);
    second.stop();
  });

  it('keeps no trace of a set past the frame cap', async () => {
    const actor = createActor(workoutSession, {
      input: { challenge: squatTest, record: true },
    }).start();
    const pose = body({});
    for (let i = 0; i <= 9000; i++)
      native.onResult?.({ ...pose, timestampMs: 1000 + i * 66, cameraLandmarks: [] });
    actor.send({ type: 'end' });
    await flush();
    expect(written).toEqual([]);
    actor.stop();
  });
});
