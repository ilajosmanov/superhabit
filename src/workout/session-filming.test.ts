import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createActor } from 'xstate';

import type { VideoOutput } from './camcorder';
import { body } from '@/exercises/__fixtures__/body';
import { plank } from '@/exercises/__fixtures__/plank';
import {
  challenge,
  disk,
  files,
  finalizer,
  flush,
  modules,
  play,
  reset,
  squat,
  squatTest,
  stops,
  stuck,
  takes,
  video,
} from './__fixtures__/session';

vi.mock('expo', () => ({ uuid: { v4: () => crypto.randomUUID() } }));
vi.mock('superhabit-pose', () => modules['superhabit-pose']);
vi.mock('expo-speech', () => modules['expo-speech']);
vi.mock('expo-file-system', () => modules['expo-file-system']);
vi.mock('expo-screen-orientation', () => modules['expo-screen-orientation']);

const { workoutSession } = await import('./session');
const { sessionView } = await import('./session-view');

afterEach(reset);

describe('workoutSession filming', () => {
  it('films each set from the start position into its own file and keeps every file on the phone', async () => {
    const actor = createActor(workoutSession, { input: { challenge, video } }).start();
    const view = () => sessionView(actor.getSnapshot());
    play(body({ thigh: 70, shin: 25 })); // crouched: still waiting, nothing filmed
    await flush();
    expect(takes).toHaveLength(0);

    play(body({})); // standing: counting starts
    await flush();
    expect(view().recording).toBe(true);
    play(body({ thigh: 70, shin: 25 }), body({}));
    expect(view()).toMatchObject({ stage: 'switching', recording: false });
    expect(stops()).toEqual([true]);

    actor.send({ type: 'next' });
    play(plank({ elbow: 170 }));
    await flush();
    play(plank({ elbow: 95 }), plank({ elbow: 170 }));
    expect(view()).toMatchObject({ stage: 'finished', final: false }); // files not final yet
    expect(disk.size).toBe(2);
    await flush();
    expect(view().final).toBe(true);
    const [squatSet, pushupSet] = view().results;
    const filmed = [...disk].map((name) => `file:///cache/reps/${name}`);
    expect([...squatSet.takes, ...pushupSet.takes]).toEqual(filmed); // one file each, in order
    expect(disk.size).toBe(2); // the Done screen's switch decides once it closes
    expect(view().share).toBe(true); // and starts on
    actor.stop();
    await flush();
    expect(disk.size).toBe(0);
    expect([...files].filter((path) => path.startsWith('document/videos/'))).toHaveLength(2);
  });

  it('deletes every file when the Done screen switch is off', async () => {
    const actor = createActor(workoutSession, { input: { challenge, video } }).start();
    play(body({}));
    await flush();
    play(body({ thigh: 70, shin: 25 }), body({}));
    actor.send({ type: 'next' });
    play(plank({ elbow: 170 }));
    await flush();
    play(plank({ elbow: 95 }), plank({ elbow: 170 }));
    await flush();
    actor.send({ type: 'shareTraces', share: false });
    expect(sessionView(actor.getSnapshot()).share).toBe(false); // the switch shows what it decided
    actor.stop();
    await flush();
    expect(disk.size).toBe(0);
    expect(files.size).toBe(0);
  });

  it('drops a file that fails after its set ended from that set', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const actor = createActor(workoutSession, { input: { challenge, video } }).start();
    const view = () => sessionView(actor.getSnapshot());
    play(body({}));
    await flush();
    play(body({ thigh: 70, shin: 25 }), body({}));
    expect(view().stage).toBe('switching');
    expect(view().results[0].takes).toHaveLength(1);
    takes[0].error = new Error('encoder'); // the squat file fails while finalizing
    await flush();
    expect(view().results[0].takes).toEqual([]);

    actor.send({ type: 'next' });
    play(plank({ elbow: 170 }));
    await flush();
    play(plank({ elbow: 95 }), plank({ elbow: 170 }));
    await flush();
    expect(view().results[1].takes).toHaveLength(1);
    actor.stop();
    warn.mockRestore();
  });

  it('marks the results final only once every file is', async () => {
    const actor = createActor(workoutSession, { input: { challenge: squatTest, video } }).start();
    const view = () => sessionView(actor.getSnapshot());
    play(body({}));
    await flush();
    squat();
    actor.send({ type: 'end' });
    expect(view()).toMatchObject({ stage: 'finished', final: false });
    await flush();
    expect(view().final).toBe(true);
    actor.stop();
  });

  it('marks the results final as soon as it finishes without a video output', () => {
    const actor = createActor(workoutSession, { input: { challenge: squatTest } }).start();
    squat();
    expect(sessionView(actor.getSnapshot()).final).toBe(false);
    actor.send({ type: 'end' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'finished', final: true });
    actor.stop();
  });

  it('deletes the other old files when one of them cannot be deleted', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    disk.add('old-a.mp4');
    disk.add('old-b.mp4');
    stuck.add('old-a.mp4');
    createActor(workoutSession, { input: { challenge, video } }).start().stop();
    expect([...disk]).toEqual(['old-a.mp4']);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('cuts the take on pause, films again once back in position and keeps both files in the set', async () => {
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
    actor.send({ type: 'end' });
    expect(view().results[0].takes).toHaveLength(2);
    actor.stop();
    expect(takes[1].stopped).toBe(true);
    await flush();
    expect(disk.size).toBe(0);
    expect(files.size).toBe(2);
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

  it('keeps a file that appears after leaving', async () => {
    const actor = createActor(workoutSession, { input: { challenge: squatTest, video } }).start();
    play(body({}));
    for (let i = 0; i < 50 && !takes.length; i++) await Promise.resolve(); // starting, no file yet
    actor.stop();
    expect(disk.size).toBe(0);
    await flush(); // the file appears, is finalized, then kept
    expect(takes).toMatchObject([{ final: true }]);
    expect(disk.size).toBe(0);
    expect(files.size).toBe(1);
  });

  it('cleans up only its own files when it finalizes after the next session started', async () => {
    const actor = createActor(workoutSession, { input: { challenge: squatTest, video } }).start();
    play(body({}));
    await flush();
    const slow: (() => void)[] = [];
    finalizer.held = slow; // CameraX is slow to finalize this session's file
    actor.send({ type: 'end' });
    actor.stop();
    finalizer.held = null;

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

  it('leaves a failed file out of its set, and keeps one the OS ended early', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const actor = createActor(workoutSession, { input: { challenge: squatTest, video } }).start();
    const view = () => sessionView(actor.getSnapshot());
    play(body({}));
    await flush();
    squat();
    takes[0].end(new Error('encoder')); // the encoder fails: the file is unusable
    await flush();
    expect(view()).toMatchObject({ recording: false, attempts: [{ counted: true, cue: null }] });
    actor.send({ type: 'end' });
    await flush();
    expect(view().results[0].takes).toEqual([]);
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
    expect(sessionView(ended.getSnapshot()).results[0].takes).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith('[camcorder] recording failed', expect.any(Error));
    ended.stop();
    warn.mockRestore();
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
    expect(sessionView(actor.getSnapshot()).filming).toBe(true);
    actor.send({ type: 'videoLost' });
    expect(sessionView(actor.getSnapshot()).filming).toBe(false);
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
      filming: false,
      final: true,
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
      results: [{ reps: 1, takes: [] }],
      recording: false,
    });
    expect(warn).toHaveBeenCalled();
    actor.stop();
    warn.mockRestore();
  });
});
