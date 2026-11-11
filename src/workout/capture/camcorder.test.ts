import { files, modules } from '@/workout/__fixtures__/session';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import { createActor, setup } from 'xstate';

import { camcorder, videoFile, type VideoOutput } from './camcorder';
import { videosOf } from '@/storage/set-files';

vi.mock('expo-file-system', () => modules['expo-file-system']);

// Signed in as `local`; no database here.
vi.mock('@/storage/account', () => ({ userId: () => 'local' }));

afterEach(() => files.clear());

const dir = 'document/local/videos';

it("lists a set's videos in take order, keeping a gap a failed take left", () => {
  // Take 1 failed; take 10 sorts after 2 by number, not by name.
  for (const name of ['a-10', 'a-0', 'a-2', 'b-0', 'ab-0']) files.add(`${dir}/${name}.mp4`);

  expect(videosOf(['a', 'c'])).toEqual(
    new Map([['a', [`${dir}/a-0.mp4`, `${dir}/a-2.mp4`, `${dir}/a-10.mp4`]]]),
  );
});

it('leaves out a set whose take is still being written', () => {
  const take = videoFile('a', 1);
  files.add(`${dir}/a-0.mp4`);
  files.add(`${dir}/a-1.mp4`);
  expect(videosOf(['a'])).toEqual(new Map());

  take.finish(true);
  expect(videosOf(['a']).get('a')).toHaveLength(2);
});

const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const filming = (video: VideoOutput) => {
  const events: string[] = [];
  const messages: unknown[] = [];
  const actor = createActor(
    setup({ actors: { camcorder } }).createMachine({
      invoke: { id: 'camera', src: 'camcorder', input: { video, onTake: () => {} } },
      on: {
        '*': {
          actions: ({ event }) => {
            events.push(event.type);
            messages.push(event);
          },
        },
      },
    }),
  ).start();
  const camera = actor.getSnapshot().children.camera;
  return { actor, camera, events, messages };
};

it('lists a started file when cut while native start is still in flight', async () => {
  let start = () => {};
  let finish = () => {};
  const video: VideoOutput = {
    createRecorder: async ({ filePath = '' }) => ({
      recordedDuration: 0,
      startRecording: (onFinished) =>
        new Promise<void>((resolve) => {
          start = () => {
            files.add(filePath);
            resolve();
          };
          finish = () => onFinished(filePath);
        }),
      stopRecording: async () => finish(),
    }),
  };
  const { actor, camera, events, messages } = filming(video);
  camera?.send({ type: 'roll', setId: 'cut' });
  await tick();
  camera?.send({ type: 'cut' });
  camera?.send({ type: 'logged', setId: 'cut' });
  camera?.send({ type: 'wrap' });
  start();
  await tick();

  expect(events).toEqual(['rolling', 'taken', 'wrapped']);
  expect(messages[0]).toEqual({ type: 'rolling', setId: 'cut', uri: `${dir}/cut-0.mp4` });
  expect(videosOf(['cut']).get('cut')).toEqual([`${dir}/cut-0.mp4`]);
  actor.stop();
});

it.each([false, true])(
  'abandons an unresolved start on teardown, releases its reservation and deletes a late file (queued: %s)',
  async (queued) => {
    let start = () => {};
    let finish = () => {};
    const video: VideoOutput = {
      createRecorder: async ({ filePath = '' }) => ({
        recordedDuration: 0,
        startRecording: (onFinished) =>
          new Promise<void>((resolve) => {
            start = () => {
              files.add(filePath);
              resolve();
            };
            finish = () => onFinished(filePath);
          }),
        stopRecording: async () => finish(),
      }),
    };
    const { actor, camera } = filming(video);
    camera?.send({ type: 'roll', setId: 'stalled' });
    await tick();
    if (queued) camera?.send({ type: 'roll', setId: 'stalled' });
    files.add(`${dir}/stalled-0.mp4`);
    expect(videosOf(['stalled']).size).toBe(0);
    actor.stop();
    expect(files.size).toBe(0);
    files.add(`${dir}/stalled-9.mp4`);
    expect(videosOf(['stalled']).get('stalled')).toEqual([`${dir}/stalled-9.mp4`]);
    start();
    await tick();
    expect(files).toEqual(new Set([`${dir}/stalled-9.mp4`]));
  },
);

it('never starts a recorder created after its take was cut', async () => {
  const startRecording = vi.fn(async () => {});
  let created = () => {};
  const video: VideoOutput = {
    createRecorder: () =>
      new Promise((resolve) => {
        created = () =>
          resolve({ recordedDuration: 0, startRecording, stopRecording: async () => {} });
      }),
  };
  const { actor, camera, events } = filming(video);
  camera?.send({ type: 'roll', setId: 'unstarted' });
  await tick();
  camera?.send({ type: 'cut' });
  camera?.send({ type: 'wrap' });
  created();
  await tick();
  expect(startRecording).not.toHaveBeenCalled();
  expect(events).toEqual(['wrapped']);
  expect(files.size).toBe(0);
  actor.stop();
});

it.each([false, true])(
  'wraps a successful take before native start resolves (late start: %s)',
  async (lateStart) => {
    let start = () => {};
    let finish = () => {};
    const video: VideoOutput = {
      createRecorder: async ({ filePath = '' }) => ({
        recordedDuration: 0,
        startRecording: (onFinished) =>
          new Promise<void>((resolve) => {
            start = resolve;
            files.add(filePath);
            finish = () => onFinished(filePath);
          }),
        stopRecording: async () => {},
      }),
    };
    const { actor, camera, events, messages } = filming(video);
    try {
      camera?.send({ type: 'roll', setId: 'completed' });
      await tick();
      expect(videosOf(['completed']).size).toBe(0);
      camera?.send({ type: 'logged', setId: 'completed' });
      camera?.send({ type: 'wrap' });
      finish();
      await tick();
      if (lateStart) start();
      finish();
      await tick();
      expect(events).toEqual(['rolling', 'taken', 'wrapped']);
      expect(messages.slice(0, 2)).toEqual([
        { type: 'rolling', setId: 'completed', uri: `${dir}/completed-0.mp4` },
        { type: 'taken', uri: `${dir}/completed-0.mp4`, ok: true },
      ]);
      expect(videosOf(['completed']).get('completed')).toEqual([`${dir}/completed-0.mp4`]);
    } finally {
      actor.stop();
    }
    expect(files).toContain(`${dir}/completed-0.mp4`);
  },
);

it('wraps a failed take even when its native start promise never resolves', async () => {
  let fail = () => {};
  const video: VideoOutput = {
    createRecorder: async () => ({
      recordedDuration: 0,
      startRecording: (_onFinished, onError) =>
        new Promise<void>(() => {
          fail = () => onError(new Error('encoder failed during start'));
        }),
      stopRecording: async () => {},
    }),
  };
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { actor, camera, events } = filming(video);
  try {
    camera?.send({ type: 'roll', setId: 'failed' });
    await tick();
    fail();
    camera?.send({ type: 'wrap' });
    await tick();
    expect(events).toContain('wrapped');
    expect(files.size).toBe(0);
  } finally {
    actor.stop();
    warn.mockRestore();
  }
});
