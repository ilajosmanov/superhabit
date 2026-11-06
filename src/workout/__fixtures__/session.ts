/**
 * Fakes for the boundaries a session touches (native detector, speech, file system, orientation lock,
 * camera video output) and pose helpers that drive it. Each test file mocks the native modules with
 * `modules`, then imports `./session` dynamically, and calls `reset` after each test.
 */
import type { PoseDetection } from 'superhabit-pose';
import { Joint } from 'superhabit-pose/joints';
import { vi } from 'vite-plus/test';

import type { Pose } from '@/exercises/registry';
import { body } from '@/exercises/__fixtures__/body';
import { plank } from '@/exercises/__fixtures__/plank';
import type { VideoOutput } from '@/workout/camcorder';
import { defineChallenge, MAX, reps, type Step } from '@/workout/plan';

export const speak = vi.fn();
export const lockAsync = vi.fn(async () => {});
export const PORTRAIT = 2;
export const LANDSCAPE = 5;
// The fake native detector: the session sets `onResult`, the test calls it like native would.
export const native: { close: () => void; onResult?: (result: PoseDetection) => void } = {
  close: vi.fn(),
};

// The fake cache folder: names of the files in it; `stuck` ones fail to delete.
export const disk = new Set<string>();
export const stuck = new Set<string>();
export const written: { name: string; text: string }[] = [];
export const createDirectory = vi.fn();
export const writeFile = vi.fn(async (name: string, text: string) => {
  written.push({ name, text });
});
const cached = (name: string) => ({
  uri: `file:///cache/reps/${name}`,
  get exists() {
    return disk.has(name);
  },
  delete: () => {
    if (stuck.has(name)) throw new Error(`cannot delete ${name}`);
    disk.delete(name);
  },
  write: (text: string) => writeFile(name, text),
});

/** Module fakes, for `vi.mock(name, () => modules[name])` in each test file. */
export const modules = {
  'superhabit-pose': { createPoseLandmarker: () => native },
  'expo-speech': { speak, stop: vi.fn() },
  'expo-file-system': {
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
  },
  'expo-screen-orientation': {
    lockAsync,
    OrientationLock: { PORTRAIT, LANDSCAPE },
  },
};

export const NOW = Date.UTC(2026, 10, 6, 7);
/** Detector time (ms) and frame count, continued across calls and tests. */
export let clock = 0;
export let frames = 0;
// Holds a pose `ms` at detector speed, continuing the clock across calls.
export const hold = (ms: number, pose: Pose) => {
  for (const end = clock + ms; clock <= end; clock += 66, frames++)
    native.onResult?.({
      timestampMs: clock,
      ...pose,
      cameraLandmarks: [],
    });
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
    session: [{ steps, rounds: 1 }],
  });
export const squatTest = plan({ exercise: 'squat', goal: MAX });
export const challenge = plan(
  { exercise: 'squat', goal: reps(1) },
  { exercise: 'pushup', goal: reps(1) },
);

type Take = {
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
export const takes: Take[] = [];
/** While `held` is a list, finished files wait in it until the test calls them (CameraX is slow). */
export const finalizer: { held: (() => void)[] | null } = { held: null };
export const video: VideoOutput = {
  createRecorder: async ({ filePath = '' }) => {
    let recording = false;
    const take: Take = { stopped: false, final: false, afterFinal: false, end: () => {} };
    return {
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
export const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};
export const stops = () => takes.map((t) => t.stopped);

/** After each test: real timers, and no takes or files left from it. */
export function reset() {
  vi.useRealTimers();
  takes.length = 0;
  disk.clear();
  stuck.clear();
  written.length = 0;
}
