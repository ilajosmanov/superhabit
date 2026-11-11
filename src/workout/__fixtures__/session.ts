/**
 * Fakes for the boundaries a session touches (native detector, speech, file system, orientation lock,
 * camera video output) and pose helpers that drive it. Each test file mocks the native modules with
 * `modules` and the database with Node's SQLite (`@/storage/__fixtures__/database`), then imports
 * `./session` dynamically, and calls `reset` after each test.
 */
import { gzipSync } from 'fflate';
import type { PoseDetection } from 'superhabit-pose';
import { Joint } from 'superhabit-pose/joints';
import { vi } from 'vite-plus/test';

import type { Pose } from '@/exercises/registry';
import { body, detection } from '@/exercises/__fixtures__/body';
import { plank } from '@/exercises/__fixtures__/plank';

import { db } from '@/storage/__fixtures__/database';
import * as schema from '@/storage/schema';
import type { VideoOutput } from '@/workout/capture/camcorder';
import { defineChallenge, MAX, reps, type Step } from '@/workout/plan/plan';

export const speak = vi.fn();
export const lockAsync = vi.fn(async () => {});
export const PORTRAIT = 2;
export const LANDSCAPE = 5;
// The fake native detector: the session sets `onResult`, the test calls it like native would.
export const native: {
  close: () => void;
  onResult?: (result: PoseDetection) => void;
  onFailed?: (message: string) => void;
} = {
  close: vi.fn(),
};

// Files that fail at the native delete boundary.
export const stuck = new Set<string>();
export const written: { name: string; bytes: Uint8Array }[] = [];
export const createDirectory = vi.fn();
/** The native rename boundary; throw to simulate a failed finalization. */
export const renameFile = vi.fn();
export const writeFile = vi.fn(async (name: string, bytes: Uint8Array) => {
  written.push({ name, bytes });
});
// All native files: video output and the gzip boundary create them.
export const files = new Set<string>();
const folders = new Set<string>();
const under = (path: string, folder: string) => path.startsWith(`${folder}/`);
class FakeDirectory {
  readonly uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  }
  get name() {
    return this.uri.split('/').pop() ?? '';
  }
  get exists() {
    return folders.has(this.uri) || [...files, ...folders].some((path) => under(path, this.uri));
  }
  create(options: unknown) {
    createDirectory(options);
    folders.add(this.uri);
  }
  /** Direct children, like Expo Directory.list(). */
  list() {
    return [...files]
      .filter((path) => under(path, this.uri) && !path.slice(this.uri.length + 1).includes('/'))
      .map((path) => traceFile(this.uri, path.slice(this.uri.length + 1)));
  }
}
const traceFile = (folder: string, name: string) => ({
  uri: `${folder}/${name}`,
  name,
  get exists() {
    return files.has(`${folder}/${name}`);
  },
  delete: () => {
    if (stuck.has(`${folder}/${name}`)) throw new Error(`cannot delete ${name}`);
    files.delete(`${folder}/${name}`);
  },
  rename: (to: string) => {
    renameFile(to);
    if (!files.has(`${folder}/${name}`)) throw new Error(`${folder}/${name} is gone`);
    files.add(`${folder}/${to}`);
    files.delete(`${folder}/${name}`);
  },
});

/** Module fakes, for `vi.mock(name, () => modules[name])` in each test file. */
export const modules = {
  'superhabit-pose': { createPoseLandmarker: () => native },
  // The native gzip writes into the fake trace folders; `written` keeps the gzipped bytes.
  'superhabit-gzip-file': {
    writeGzip: async (bytes: ArrayBuffer, uri: string) => {
      await writeFile(uri.slice(uri.lastIndexOf('/') + 1), gzipSync(new Uint8Array(bytes)));
      files.add(uri);
    },
  },
  'react-native': {
    Platform: { OS: 'android', Version: 37, constants: { Model: 'Pixel 9', Release: '17' } },
    AppState: { addEventListener: () => ({ remove: () => {} }) },
  },
  'expo-speech': { speak, stop: vi.fn() },
  'expo-file-system': {
    Paths: {
      cache: { uri: 'cache' },
      document: { uri: 'document' },
      get availableDiskSpace() {
        return disk.free;
      },
    },
    Directory: FakeDirectory,
    File: class {
      constructor(dir: FakeDirectory, name: string) {
        return traceFile(dir.uri, name);
      }
    },
  },
  'expo-screen-orientation': {
    lockAsync,
    OrientationLock: { PORTRAIT, LANDSCAPE },
  },
  'expo-constants': { default: { expoConfig: { version: '1.0.0' } } },
};

export const NOW = Date.UTC(2026, 10, 6, 7);
/** The session's workout: a free log started at NOW. */
export const LOG = {
  workoutId: 'w',
  target: { runId: null, versionId: null },
  start: new Date(NOW),
};
/** Detector time (ms) and frame count, continued across calls and tests. */
export let clock = 0;
export let frames = 0;
// Holds a pose `ms` at detector speed, continuing the clock across calls.
export const hold = (ms: number, pose: Pose) => {
  for (const end = clock + ms; clock <= end; clock += 66, frames++)
    native.onResult?.(detection(pose, clock));
};
// Holds each pose 1.5 s.
export const play = (...poses: Pose[]) => poses.forEach((pose) => hold(1500, pose));
export const squat = () => play(body({}), body({ thigh: 70, shin: 25 }), body({}));
export const halfSquat = () => play(body({ thigh: 25, shin: 20 }), body({})); // a no-rep
export const pushup = () =>
  play(plank({ elbow: 170 }), plank({ elbow: 80 }), plank({ elbow: 170 }));
export const feetOut = (pose: Pose): Pose => {
  for (const i of [Joint.LEFT_ANKLE, Joint.RIGHT_ANKLE])
    pose.landmarks[i] = { ...pose.landmarks[i], y: 1.2 };
  return pose;
};
export const headOut = (pose: Pose): Pose => {
  for (const i of [Joint.NOSE, Joint.LEFT_SHOULDER, Joint.RIGHT_SHOULDER])
    pose.landmarks[i] = { ...pose.landmarks[i], y: -0.2 };
  return pose;
};
export const spoken = () => speak.mock.calls.map(([text]) => text);

export const plan = (...steps: [Step, ...Step[]]) =>
  defineChallenge({
    name: 't',
    days: 1,
    restartOnMiss: false,
    dailyTotal: false,
    session: [{ steps, rounds: 1 }],
  });
export const squatTest = plan({ exercise: 'squat', goal: MAX });
export const challenge = plan(
  { exercise: 'squat', goal: reps(1) },
  { exercise: 'pushup', goal: reps(1) },
);

type Take = {
  filePath: string;
  duration: number;
  stopped: boolean;
  /** The file is final (finished or failed). */
  final: boolean;
  /** Every earlier take was final when this one started. */
  afterFinal: boolean;
  /** Set before the file is final to make it fail (the encoder errors while finalizing). */
  error?: Error;
  /** Ends the recording like the OS would (or the encoder, with an error). */
  end: (error?: Error) => void;
};
// The fake camera video output, like VisionCamera on CameraX: a take's file appears once it has started,
// is final a tick after the recording ends (or once released from `finalizer.held`), and stopping a recording that has ended rejects.
/** The phone's free space, in bytes. */
export const disk = { free: 64 * 1024 ** 3 };
export const takes: Take[] = [];
/** While `held` is a list, finished files wait in it until the test calls them (CameraX is slow). */
export const finalizer: { held: (() => void)[] | null } = { held: null };
export const video: VideoOutput = {
  createRecorder: async ({ filePath = '' }) => {
    let recording = false;
    const take: Take = {
      filePath,
      duration: 0,
      stopped: false,
      final: false,
      afterFinal: false,
      end: () => {},
    };
    return {
      get recordedDuration() {
        return recording ? take.duration : 0;
      },
      startRecording: (onFinished, onError) => {
        take.afterFinal = takes.every((t) => t.final);
        takes.push(take);
        take.end = (error) => {
          recording = false;
          take.error ??= error;
          const final = () => {
            take.final = true;
            if (take.error) onError(take.error);
            else onFinished(filePath);
          };
          if (finalizer.held) finalizer.held.push(final);
          else setImmediate(final);
        };
        return new Promise((started) =>
          setImmediate(() => {
            files.add(filePath);
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
export const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};
export const stops = () => takes.map((t) => t.stopped);

/** After each test: real timers, and no takes, files or workouts left from it. */
export function reset() {
  vi.useRealTimers();
  disk.free = 64 * 1024 ** 3;
  takes.length = 0;
  finalizer.held = null;
  stuck.clear();
  written.length = 0;
  files.clear();
  folders.clear();
  db().delete(schema.workouts).run();
  db().delete(schema.outbox).run();
}
