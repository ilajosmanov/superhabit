import type { PoseDetection } from 'superhabit-pose';

import type { Pose } from './geometry';

export type TracePoint = readonly [x: number, y: number, z: number, visibility: number];
export type TraceFrame = {
  t: number;
  landmarks: readonly TracePoint[];
  world: readonly TracePoint[];
};
export type Trace = {
  version: 1;
  source: { dataset: string; clip: string; url: string; license: string };
  exercise: string;
  labels: { reps?: number; holdMs?: number; inShape?: boolean };
  fps: number;
  frames: readonly TraceFrame[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path}: expected an object`);
  return value;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected an array`);
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path}: expected a string`);
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${path}: expected a finite number`);
  return value;
}

function nonnegative(value: unknown, path: string): number {
  const n = finite(value, path);
  if (n < 0) throw new Error(`${path}: expected a nonnegative number`);
  return n;
}

function points(value: unknown, path: string): TracePoint[] {
  const entries = array(value, path);
  if (entries.length !== 0 && entries.length !== 33)
    throw new Error(`${path}: expected 0 or 33 points`);
  return entries.map((entry, i): TracePoint => {
    const at = `${path}[${i}]`;
    const p = array(entry, at);
    if (p.length !== 4) throw new Error(`${at}: expected 4 coordinates`);
    return [
      finite(p[0], `${at}[0]`),
      finite(p[1], `${at}[1]`),
      finite(p[2], `${at}[2]`),
      finite(p[3], `${at}[3]`),
    ];
  });
}

/** Strict Trace v1 data; extra fields from dataset extraction are tolerated. */
export function parseTrace(json: unknown): Trace {
  const root = record(json, 'trace');
  if (root.version !== 1) throw new Error('version: expected 1');
  const source = record(root.source, 'source');
  const labels = record(root.labels, 'labels');
  const parsedLabels: Trace['labels'] = {};
  if (labels.reps !== undefined) {
    const reps = nonnegative(labels.reps, 'labels.reps');
    if (!Number.isInteger(reps)) throw new Error('labels.reps: expected an integer');
    parsedLabels.reps = reps;
  }
  if (labels.holdMs !== undefined)
    parsedLabels.holdMs = nonnegative(labels.holdMs, 'labels.holdMs');
  if (labels.inShape !== undefined) {
    if (typeof labels.inShape !== 'boolean') throw new Error('labels.inShape: expected a boolean');
    parsedLabels.inShape = labels.inShape;
  }
  const fps = finite(root.fps, 'fps');
  if (fps <= 0) throw new Error('fps: expected a positive number');
  let lastT = -1;
  const frames = array(root.frames, 'frames').map((value, i): TraceFrame => {
    const at = `frames[${i}]`;
    const frame = record(value, at);
    const t = nonnegative(frame.t, `${at}.t`);
    if (i === 0 && t !== 0) throw new Error(`${at}.t: expected 0 at clip start`);
    if (t <= lastT) throw new Error(`${at}.t: expected a strictly increasing timestamp`);
    lastT = t;
    const landmarks = points(frame.landmarks, `${at}.landmarks`);
    const world = points(frame.world, `${at}.world`);
    if (landmarks.length !== world.length)
      throw new Error(`${at}.world: landmarks and world must both be empty or both have 33 points`);
    return { t, landmarks, world };
  });
  return {
    version: 1,
    source: {
      dataset: text(source.dataset, 'source.dataset'),
      clip: text(source.clip, 'source.clip'),
      url: text(source.url, 'source.url'),
      license: text(source.license, 'source.license'),
    },
    exercise: text(root.exercise, 'exercise'),
    labels: parsedLabels,
    fps,
    frames,
  };
}

export function toPose(frame: TraceFrame): Pose {
  const landmark = ([x, y, z, visibility]: TracePoint) => ({ x, y, z, visibility });
  return {
    landmarks: frame.landmarks.map(landmark),
    worldLandmarks: frame.world.map(landmark),
  };
}

export function toFrame(result: PoseDetection, t0: number): TraceFrame {
  const point = ({ x, y, z, visibility }: Pose['landmarks'][number]): TracePoint => [
    x,
    y,
    z,
    visibility,
  ];
  return {
    t: result.timestampMs - t0,
    landmarks: result.landmarks.map(point),
    world: result.worldLandmarks.map(point),
  };
}
