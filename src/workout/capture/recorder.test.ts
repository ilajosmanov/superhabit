import { setImmediate } from 'node:timers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createActor } from 'xstate';
import { eq, sql } from 'drizzle-orm';

import { MAX, seconds } from '@/workout/plan/plan';
import { body, detection } from '@/exercises/__fixtures__/body';
import { plank } from '@/exercises/__fixtures__/plank';
import { replay, toPose } from '@/exercises/__fixtures__/replay';
import { COUNTER_VERSIONS, EXERCISES } from '@/exercises/registry';
import { decodeTrace } from '@/storage/trace-file';

import {
  challenge,
  createDirectory,
  feetOut,
  files,
  finalizer,
  flush,
  frames,
  hold,
  LOG,
  modules,
  native,
  NOW,
  plan,
  play,
  pushup,
  renameFile,
  reset,
  squat,
  squatTest,
  takes,
  video,
  writeFile,
  written,
} from '@/workout/__fixtures__/session';
import { db, migrateDatabase } from '@/storage/__fixtures__/database';
import * as schema from '@/storage/schema';

vi.mock('expo', () => ({ uuid: { v4: () => crypto.randomUUID() } }));
vi.mock('react-native', () => modules['react-native']);
vi.mock('superhabit-pose', () => modules['superhabit-pose']);
vi.mock('superhabit-gzip-file', () => modules['superhabit-gzip-file']);
vi.mock('expo-speech', () => modules['expo-speech']);
vi.mock('expo-file-system', () => modules['expo-file-system']);
vi.mock('expo-screen-orientation', () => modules['expo-screen-orientation']);
vi.mock('expo-constants', () => modules['expo-constants']);
vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));
vi.mock('drizzle-orm/expo-sqlite', () => ({}));

const { workoutSession } = await import('@/workout/session/session');
const { sessionView } = await import('@/workout/session/session-view');
const { recovery } = await import('@/workout/recovery');

beforeAll(migrateDatabase);
beforeEach(() => {
  let frame = 0;
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    setImmediate(() => callback(performance.now()));
    return ++frame;
  });
});
afterEach(() => {
  reset();
  vi.unstubAllGlobals();
});

describe('set traces', () => {
  it('keeps two paused takes with their filenames, file-time boundaries and median video anchors before MP4 finalization', async () => {
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: squatTest, record: true, video },
    }).start();
    const setId = actor.getSnapshot().context.setId;
    const frame = (timestampMs: number) => native.onResult?.(detection(body({}), timestampMs));
    frame(10000);
    frame(10100); // Roll at file time 100, before native start resolves.
    frame(10150); // Before rolling: never a clock sample.
    await flush();
    for (const [timestampMs, duration] of [
      [10200, 0], // A new recorder has not written a sample yet.
      [10300, 0.25],
      [10400, 0.35],
      [10500, 0.44],
      [10600, 0.01], // Outlier: a mean or last-sample anchor would be wrong.
      [10700, 0.65],
    ]) {
      takes[0].duration = duration;
      frame(timestampMs);
    }
    actor.send({ type: 'pause' });
    frame(11000);
    actor.send({ type: 'resume' });
    frame(11100);
    frame(11200);
    await flush();
    for (const [timestampMs, duration] of [
      [11300, 0],
      [11400, 0.15],
      [11500, 0.25],
      [11600, 0.34],
      [11700, 0.35],
    ]) {
      takes[1].duration = duration;
      frame(timestampMs);
    }
    const pending: (() => void)[] = [];
    finalizer.held = pending;
    actor.send({ type: 'end' });
    await flush();
    expect(takes.map((take) => take.filePath)).toEqual([
      `document/local/videos/${setId}-0.mp4`,
      `document/local/videos/${setId}-1.mp4`,
    ]);
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      final: false,
      results: [{ takes: takes.map((take) => take.filePath) }],
    });
    const trace = decodeTrace(written[0].bytes);
    expect(trace.header.takes).toEqual([
      { startMs: 100, endMs: 700, videoAnchorMs: 50 },
      { startMs: 1200, endMs: 1700, videoAnchorMs: 1255 },
    ]);
    expect(trace.frames.at(-1)?.t).toBe(1700);
    pending.forEach((finish) => finish());
    finalizer.held = null;
    actor.send({ type: 'save' });
    actor.stop();
    await flush();
    expect(files).toEqual(
      new Set([
        `document/local/traces/pending/${setId}.sht`,
        `document/local/videos/${setId}-0.mp4`,
        `document/local/videos/${setId}-1.mp4`,
      ]),
    );
  });

  it("lands a set's trace in its account's folder, though you sign out while it's written", async () => {
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: squatTest, record: true },
    }).start();
    const setId = actor.getSnapshot().context.setId;
    play(body({}));
    actor.send({ type: 'end' });
    // Signed out and another account signed in before the write's first paint.
    const account = eq(schema.settings.key, 'account');
    const [kept] = db().select().from(schema.settings).where(account).all();
    db()
      .update(schema.settings)
      .set({ value: { id: 'bob', name: 'Bob', image: null } })
      .where(account)
      .run();
    try {
      await flush();
      expect(files).toContain(`document/local/traces/pending/${setId}.sht`);
    } finally {
      actor.stop();
      db().update(schema.settings).set({ value: kept?.value }).where(account).run();
    }
  });

  it.each([false, true])(
    'keeps null anchors with too few samples or a lost camera (lost: %s)',
    async (lost) => {
      const actor = createActor(workoutSession, {
        input: { ...LOG, challenge: squatTest, record: true, video },
      }).start();
      const frame = (timestampMs: number) => native.onResult?.(detection(body({}), timestampMs));
      frame(10000);
      frame(10100);
      await flush();
      for (let i = 0; i < 10; i++) frame(10200 + i * 100); // Zero duration is never a sample.
      for (let i = 0; i < (lost ? 3 : 2); i++) {
        takes[0].duration = 1 + i * 0.1;
        frame(12000 + i * 100);
      }
      if (lost) actor.send({ type: 'videoLost' });
      actor.send({ type: 'pause' });
      actor.send({ type: 'resume' });
      frame(13000);
      frame(13100);
      await flush();
      actor.send({ type: 'end' });
      await flush();
      const trace = decodeTrace(written[0].bytes);
      expect(trace.header.takes).toEqual([
        { startMs: 100, endMs: lost ? 2200 : 2100, videoAnchorMs: null },
        { startMs: 3100, endMs: 3100, videoAnchorMs: null },
      ]);
      expect(takes).toHaveLength(lost ? 1 : 2);
      expect(sessionView(actor.getSnapshot())).toMatchObject({ stage: 'finished', final: true });
      actor.stop();
    },
  );

  it('preserves the take index when an encoder fails, leaving only the next take playable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: squatTest, record: true, video },
    }).start();
    const setId = actor.getSnapshot().context.setId;
    play(body({}));
    await flush();
    takes[0].end(new Error('encoder'));
    await flush();
    actor.send({ type: 'pause' });
    actor.send({ type: 'resume' });
    play(body({}));
    await flush();
    actor.send({ type: 'end' });
    await flush();
    expect(decodeTrace(written[0].bytes).header.takes).toHaveLength(2);
    expect(sessionView(actor.getSnapshot()).results[0].takes).toEqual([
      `document/local/videos/${setId}-1.mp4`,
    ]);
    expect([...files].filter((file) => file.endsWith('.mp4'))).toEqual([
      `document/local/videos/${setId}-1.mp4`,
    ]);
    actor.stop();
    warn.mockRestore();
  });

  it('keeps countdown, waiting, counting and paused stretches in order in a two-set circuit', async () => {
    vi.useFakeTimers({
      now: NOW,
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    const actor = createActor(workoutSession, {
      input: {
        ...LOG,
        challenge: plan(
          { exercise: 'squat', goal: MAX },
          { exercise: 'rest', goal: MAX },
          { exercise: 'squat', goal: MAX },
        ),
        record: true,
      },
    }).start();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logged = (line: string) => info.mock.calls.filter(([first]) => first === line).length;
    const firstId = actor.getSnapshot().context.setId;
    squat();
    actor.send({ type: 'pause' });
    actor.send({ type: 'resume' }); // No frames in the pause: only the explicit reset drops readiness.
    play(body({ thigh: 70, shin: 25 }), body({}));
    actor.send({ type: 'next' });
    expect(sessionView(actor.getSnapshot()).stage).toBe('resting');
    squat(); // Rest belongs to neither trace.
    actor.send({ type: 'next' });
    const secondId = actor.getSnapshot().context.setId;
    const start = frames;
    play(body({ thigh: 70, shin: 25 }));
    vi.advanceTimersByTime(1000); // Re-entering countdown must not split its stretch.
    play(body({ thigh: 70, shin: 25 }));
    vi.advanceTimersByTime(2000);
    hold(132, { landmarks: [], worldLandmarks: [] });
    play(feetOut(body({})));
    play(body({ thigh: 70, shin: 25 }));
    squat();
    actor.send({ type: 'pause' });
    squat(); // Paused movement is kept but never counted.
    actor.send({ type: 'resume' });
    play(body({ thigh: 70, shin: 25 }), body({})); // Must reacquire the start position.
    squat();
    actor.send({ type: 'end' });
    expect(sessionView(actor.getSnapshot())).toMatchObject({
      stage: 'finished',
      results: [{ reps: 1 }, { reps: 2 }],
    });
    // The set-end transition neither finishes the packing nor writes: both wait for the next paint.
    expect([logged('[recorder] encode ms'), written.length]).toEqual([0, 0]);
    await flush();
    expect([logged('[recorder] encode ms'), logged('[recorder] write ms')]).toEqual([2, 2]);
    for (const file of written) {
      const decoded = decodeTrace(file.bytes);
      expect(replay(EXERCISES.squat, decoded)).toMatchObject(decoded.header.counted);
    }
    expect(files).toEqual(
      new Set([
        `document/local/traces/pending/${firstId}.sht`,
        `document/local/traces/pending/${secondId}.sht`,
      ]),
    );
    const trace = decodeTrace(
      written.find((file) => file.name === `${secondId}.sht.tmp`)?.bytes ?? new Uint8Array(),
    );
    expect(trace.header.setId).toBe(secondId);
    expect(trace.header.counted).toEqual({ reps: 2 });
    expect(trace.frames).toHaveLength(frames - start);
    expect(trace.header.stretches?.map((stretch) => stretch.kind)).toEqual([
      'countdown',
      'waiting',
      'counting',
      'paused',
      'waiting',
      'counting',
    ]);
    const stretches = trace.header.stretches ?? [];
    expect(stretches[0].startMs).toBe(0);
    expect(stretches.at(-1)?.endMs).toBe(trace.frames.at(-1)?.t);
    expect(
      stretches.every(
        (stretch, i) =>
          stretch.startMs <= stretch.endMs &&
          (i === 0 || stretch.startMs === stretches[i - 1].endMs),
      ),
    ).toBe(true);
    expect(trace.header.waitingReasons).toEqual(
      expect.arrayContaining(['counter suspended', 'no body', 'start position']),
    );
    expect(trace.header.waitingReasons.some((reason) => reason.startsWith('out of frame:'))).toBe(
      true,
    );
    expect(trace.header.phases).toEqual(expect.arrayContaining(['waiting', 'up', 'down']));
    actor.send({ type: 'save' });
    actor.stop();
    await flush();
    expect(files.size).toBe(2); // Done keeps replay data.
  });

  it('writes the set UUID via a temp file, with native camera, device and per-frame fields', async () => {
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: squatTest, record: true },
    }).start();
    const setId = actor.getSnapshot().context.setId;
    const pose = body({});
    pose.landmarks = pose.landmarks.map((point) => ({ ...point, presence: 0.875 }));
    // Two seconds at 30 fps; distinct gravity axes, so a swapped or flipped one can't pass.
    const down = { x: 0.36, y: 0.8, z: -0.48 };
    for (let i = 0; i <= 60; i++)
      native.onResult?.({
        ...detection(pose, 1000 + (i * 1000) / 30),
        down,
        frameWidth: 720,
        frameHeight: 1280,
        rotation: 270,
        delegate: 'cpu',
      });
    actor.send({ type: 'end' });
    actor.send({ type: 'save' });
    actor.stop(); // A kept set's write outlives the session.
    await flush();
    expect(files).toEqual(new Set([`document/local/traces/pending/${setId}.sht`]));
    expect(written).toHaveLength(1);
    expect(written[0].name).toBe(`${setId}.sht.tmp`);
    const trace = decodeTrace(written[0].bytes);
    expect(trace.header).toMatchObject({
      setId,
      exercise: 'squat',
      counterVersion: COUNTER_VERSIONS.squat,
      device: { model: 'Pixel 9', os: 'android 17', delegate: 'cpu' },
      camera: {
        facing: 'front',
        fps: 30,
        width: 720,
        height: 1280,
        rotation: 270,
        mirrored: true,
        fieldOfView: null,
      },
      takes: [],
      consent: [],
      labels: {},
      counted: { reps: 0 },
    });
    expect(trace.frames).toHaveLength(61);
    expect(trace.frames[0]).toMatchObject({
      t: 0,
      down: [0.36, 0.8, -0.48],
      presence: Array(33).fill(0.875),
      brightness: 120,
      inferenceMs: 25,
      phase: 'waiting',
      waiting: 'start position',
    });
    expect(trace.frames[1].t).toBe(33);
    expect(toPose(trace.frames[0]).down).toEqual(down);
  });

  it('keeps a one-frame set, with no frame rate to measure', async () => {
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: squatTest, record: true },
    }).start();
    native.onResult?.(detection(body({}), 1000));
    actor.send({ type: 'end' });
    await flush();
    const trace = decodeTrace(written[0].bytes);
    expect(trace.frames).toHaveLength(1);
    expect(trace.header.camera?.fps).toBeNull();
    actor.stop();
  });

  it('does not expose the final name until a complete write can be renamed', async () => {
    let land = () => {};
    writeFile.mockImplementationOnce(() => new Promise<void>((resolve) => (land = resolve)));
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: squatTest, record: true },
    }).start();
    const setId = actor.getSnapshot().context.setId;
    squat();
    actor.send({ type: 'end' });
    await flush();
    expect(files.size).toBe(0);
    land();
    await flush();
    expect(files).toEqual(new Set([`document/local/traces/pending/${setId}.sht`]));
    actor.stop();
  });

  it.each(['directory creation', 'file write', 'rename'])(
    'a failed %s leaves the workout and the next set working',
    async (operation) => {
      const error = new Error(`${operation} failed`);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      if (operation === 'directory creation')
        createDirectory.mockImplementationOnce(() => {
          throw error;
        });
      else if (operation === 'file write') writeFile.mockRejectedValueOnce(error);
      else
        renameFile.mockImplementationOnce(() => {
          throw error;
        });
      const actor = createActor(workoutSession, {
        input: { ...LOG, challenge, record: true },
      }).start();
      squat();
      await flush();
      expect([...files].filter((path) => path.endsWith('.sht'))).toEqual([]);
      expect(warn).toHaveBeenCalledExactlyOnceWith('[recorder] could not write', error);
      expect(sessionView(actor.getSnapshot()).stage).toBe('switching');
      actor.send({ type: 'next' });
      const nextId = actor.getSnapshot().context.setId;
      pushup();
      await flush();
      expect(sessionView(actor.getSnapshot())).toMatchObject({
        stage: 'finished',
        results: [{ reps: 1 }, { reps: 1 }],
      });
      expect(files.has(`document/local/traces/pending/${nextId}.sht`)).toBe(true);
      const trace = decodeTrace(written.at(-1)?.bytes ?? new Uint8Array());
      expect(trace.header.exercise).toBe('pushup');
      expect(replay(EXERCISES.pushup, trace).reps).toBe(1);
      actor.stop();
    },
  );

  it('restart drops the old window and UUID, including its paused frames', async () => {
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: squatTest, record: true, video },
    }).start();
    const oldId = actor.getSnapshot().context.setId;
    play(body({}));
    await flush();
    squat();
    actor.send({ type: 'pause' });
    squat();
    actor.send({ type: 'restart' });
    const setId = actor.getSnapshot().context.setId;
    const restarted = frames;
    play(body({}));
    await flush();
    squat();
    actor.send({ type: 'end' });
    await flush();
    expect(setId).not.toBe(oldId);
    expect(files).toEqual(
      new Set([
        `document/local/traces/pending/${setId}.sht`,
        `document/local/videos/${setId}-0.mp4`,
      ]),
    );
    const trace = decodeTrace(written[0].bytes);
    expect(trace.header.counted).toEqual({ reps: 1 });
    expect(trace.frames[0].t).toBe(0);
    expect(trace.frames).toHaveLength(frames - restarted);
    expect(trace.header.stretches?.map((stretch) => stretch.kind)).toEqual(['waiting', 'counting']);
    expect(replay(EXERCISES.squat, trace).reps).toBe(1);
    actor.stop();
  });

  it('a camera flip drops old and in-flight frames and records the new camera', async () => {
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: squatTest, record: true },
    }).start();
    play(body({}));
    actor.send({ type: 'flipCamera' });
    squat(); // In-flight results from the old camera.
    actor.send({ type: 'cameraReady' });
    const ready = frames;
    squat();
    actor.send({ type: 'end' });
    await flush();
    const trace = decodeTrace(written[0].bytes);
    expect(trace.frames).toHaveLength(frames - ready);
    expect(trace.frames[0].t).toBe(0);
    expect(trace.header.camera).toMatchObject({ facing: 'back', mirrored: false });
    expect(replay(EXERCISES.squat, trace).reps).toBe(1);
    actor.stop();
  });

  it('keeps a long paused stretch and safely drops duplicate and decreasing timestamps', async () => {
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: squatTest, record: true },
    }).start();
    const pose = body({});
    for (const t of [1000, 1000, 990, 1066, 1033]) native.onResult?.(detection(pose, t));
    actor.send({ type: 'pause' });
    native.onResult?.(detection(pose, 41066));
    actor.send({ type: 'end' });
    await flush();
    const trace = decodeTrace(written[0].bytes);
    expect(trace.frames.map((frame) => frame.t)).toEqual([0, 66, 40066]);
    expect(trace.frames.map((frame) => frame.phase)).toEqual(['waiting', 'up', 'waiting']);
    expect(trace.header.stretches?.at(-1)).toEqual({ kind: 'paused', startMs: 66, endMs: 40066 });
    actor.stop();
  });

  it('writes held milliseconds on natural completion', async () => {
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: plan({ exercise: 'plank', goal: seconds(2) }), record: true },
    }).start();
    hold(2400, plank({}));
    await flush();
    const trace = decodeTrace(written[0].bytes);
    expect(trace.header.counted.heldMs).toBeGreaterThanOrEqual(2000);
    expect(replay(EXERCISES.plank, trace).heldMs).toBe(trace.header.counted.heldMs);
    actor.stop();
  });

  it.each(['Done', 'Done after a failed set insert', 'recovery'])(
    'Discard from %s leaves no trace or video files, including late writes',
    async (from) => {
      const actor = createActor(workoutSession, {
        input: { ...LOG, challenge, record: true, video },
      }).start();
      play(body({}));
      await flush();
      squat();
      await flush();
      expect(files.size).toBe(2);
      actor.send({ type: 'next' });
      play(plank({ elbow: 170 }));
      await flush();
      const pending: (() => void)[] = [];
      finalizer.held = pending;
      let land = () => {};
      const failedSet = from === 'Done after a failed set insert';
      if (!failedSet)
        writeFile.mockImplementationOnce(() => new Promise<void>((resolve) => (land = resolve)));
      // The session must also delete a trace whose set never made it into SQLite.
      if (failedSet)
        db().run(
          sql`create trigger full before insert on sets begin select raise(abort, 'disk full'); end`,
        );
      try {
        pushup();
      } finally {
        if (failedSet) db().run(sql`drop trigger full`);
      }
      await flush();
      if (failedSet) {
        expect(files.size).toBe(4);
        expect(db().select().from(schema.sets).all()).toHaveLength(1);
      }
      if (from !== 'recovery') {
        if (from === 'Done') {
          const before = new Set(files);
          db().run(
            sql`create trigger stuck before delete on workouts begin select raise(abort, 'disk I/O error'); end`,
          );
          try {
            actor.send({ type: 'discard' });
            expect(actor.getSnapshot().context.discarded).toBe(false);
            expect(files).toEqual(before); // Rows first: the open workout can still be saved.
          } finally {
            db().run(sql`drop trigger stuck`);
          }
        }
        actor.send({ type: 'discard' });
        expect(actor.getSnapshot().context.discarded).toBe(true);
      } else {
        // A failed Done leaves the workout open for launch recovery.
        db().run(
          sql`create trigger full before insert on outbox begin select raise(abort, 'disk full'); end`,
        );
        try {
          actor.send({ type: 'save' });
        } finally {
          db().run(sql`drop trigger full`);
        }
        actor.stop();
        const prompt = createActor(recovery, { input: { id: LOG.workoutId } }).start();
        prompt.send({ type: 'discard' });
        await flush();
        expect(prompt.getSnapshot().status).toBe('done');
      }
      actor.stop();
      land();
      pending.forEach((finish) => finish());
      finalizer.held = null;
      await flush();
      expect(db().select().from(schema.sets).all()).toEqual([]);
      expect(files).toEqual(new Set());
    },
  );

  it('sweeps temporary files left by a crash while keeping completed traces', () => {
    const pending = 'document/local/traces/pending/';
    files.add(`${pending}crashed.sht.tmp`);
    files.add(`${pending}kept.sht`);
    files.add(`${pending}notes.txt`);
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: squatTest, record: true },
    }).start();
    expect(files).toEqual(new Set([`${pending}kept.sht`, `${pending}notes.txt`]));
    actor.stop();
  });

  it('writes nothing with recording off or with no frames', async () => {
    const off = createActor(workoutSession, { input: { ...LOG, challenge } }).start();
    squat();
    off.send({ type: 'next' });
    pushup();
    off.stop();
    const empty = createActor(workoutSession, {
      input: { ...LOG, challenge: squatTest, record: true },
    }).start();
    empty.send({ type: 'end' });
    empty.stop();
    await flush();
    expect(files.size).toBe(0);
    expect(written).toEqual([]);
  });

  it('keeps no misleading partial trace of a set past the frame cap', async () => {
    const actor = createActor(workoutSession, {
      input: { ...LOG, challenge: squatTest, record: true },
    }).start();
    const pose = body({});
    for (let i = 0; i <= 9000; i++) native.onResult?.(detection(pose, 1000 + i * 66));
    actor.send({ type: 'end' });
    await flush();
    expect(written).toEqual([]);
    actor.stop();
  });
});
