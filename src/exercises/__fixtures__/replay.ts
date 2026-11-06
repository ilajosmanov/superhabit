import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pose } from '@/exercises/geometry';
import type { Progress } from '@/exercises/progress';
import { parseTrace, toPose, type Trace } from '@/exercises/trace';

type ReplayExercise<S extends Progress, M> = {
  initial: S;
  step(s: S, sample: M | null, nowMs: number): S;
  measure(pose: Pose): M | null;
};

/** List eagerly, parse lazily: missing data skips, present but malformed data fails. */
export function traceFiles(
  exercise: string,
  tracesRoot = fileURLToPath(new URL('./traces/', import.meta.url)),
): string[] {
  const directory = join(tracesRoot, exercise);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(directory, entry.name))
    .sort();
}

export function loadTrace(path: string): Trace {
  return parseTrace(JSON.parse(readFileSync(path, 'utf8')));
}

/** Detector timestamps drive the real measurement and counter, including tracking loss. */
export function replay<S extends Progress, M>(ex: ReplayExercise<S, M>, trace: Trace): S {
  return trace.frames.reduce(
    (state, frame) =>
      ex.step(state, frame.landmarks.length === 0 ? null : ex.measure(toPose(frame)), frame.t),
    ex.initial,
  );
}

export type Row = { clip: string; expected: number; got: number; ok: boolean };

/** Compare the counter with labels supplied by the dataset. */
export function scoreReps<S extends Progress, M>(
  ex: ReplayExercise<S, M>,
  files: string[],
  tolerance: number,
): Row[] {
  return files.flatMap((path) => {
    const trace = loadTrace(path);
    if (trace.labels.reps === undefined) return [];
    const expected = trace.labels.reps;
    const got = replay(ex, trace).reps;
    return [{ clip: trace.source.clip, expected, got, ok: Math.abs(got - expected) <= tolerance }];
  });
}

/** In-shape clips use a minimum duration ratio; timed labels use an absolute tolerance. */
export function scoreHold<S extends Progress, M>(
  ex: ReplayExercise<S, M>,
  files: string[],
  ratio: number,
  toleranceMs: number,
): Row[] {
  return files.flatMap((path) => {
    const trace = loadTrace(path);
    if (trace.labels.holdMs === undefined && trace.labels.inShape !== true) return [];
    const duration = (trace.frames.at(-1)?.t ?? 0) - (trace.frames[0]?.t ?? 0);
    const expected = trace.labels.holdMs ?? duration;
    const got = replay(ex, trace).heldMs;
    const ok =
      trace.labels.holdMs === undefined
        ? got >= ratio * duration
        : Math.abs(got - expected) <= toleranceMs;
    return [{ clip: trace.source.clip, expected, got, ok }];
  });
}
