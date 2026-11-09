import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pose } from '@/exercises/body/geometry';
import type { Progress } from '@/exercises/kinds/progress';
import { parseTrace, toPose, type Trace } from '@/exercises/body/trace';

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

/** When each rep counted, in seconds of the trace. */
export function repTimes<S extends Progress, M>(ex: ReplayExercise<S, M>, path: string): number[] {
  let state = ex.initial;
  return loadTrace(path).frames.flatMap((frame) => {
    const next = ex.step(
      state,
      frame.landmarks.length === 0 ? null : ex.measure(toPose(frame)),
      frame.t,
    );
    const counted = next.reps > state.reps;
    state = next;
    return counted ? [frame.t / 1000] : [];
  });
}

/** Reps counted inside each labelled span of a trace, and all rep times for the failure message. */
export function repsInSpans<S extends Progress, M>(
  ex: ReplayExercise<S, M>,
  path: string,
  spans: readonly (readonly [number, number])[],
) {
  const reps = repTimes(ex, path);
  return {
    reps,
    inside: spans.map(([from, to]) => reps.filter((t) => t >= from && t <= to).length),
  };
}
