import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { assert, describe, expect, it } from 'vite-plus/test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pose } from '@/exercises/body/geometry';
import type { Progress } from '@/exercises/kinds/progress';
import { toPose, type TraceFrame } from '@/exercises/body/trace';
import { decodeTrace } from '@/exercises/trace-file';

type ReplayExercise<S extends Progress, M> = {
  initial: S;
  step(s: S, sample: M | null, nowMs: number): S;
  measure(pose: Pose): M | null;
};

/** List eagerly, decode lazily: missing data skips, present but malformed data fails. */
export function traceFiles(
  exercise: string,
  tracesRoot = fileURLToPath(new URL('./traces/', import.meta.url)),
): string[] {
  const directory = join(tracesRoot, exercise);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sht'))
    .map((entry) => join(directory, entry.name))
    .sort();
}

export function loadTrace(path: string) {
  return decodeTrace(readFileSync(path));
}

/** Detector timestamps drive the real measurement and counter, including tracking loss. */
export function replay<S extends Progress, M>(
  ex: ReplayExercise<S, M>,
  trace: { frames: readonly TraceFrame[] },
): S {
  return trace.frames.reduce(
    (state, frame) =>
      ex.step(state, frame.landmarks.length === 0 ? null : ex.measure(toPose(frame)), frame.t),
    ex.initial,
  );
}

export type Row = { clip: string; expected: number; got: number; ok: boolean };

/**
 * Compare the counter with each device clip's reps, keyed by file name. A listed clip that is missing
 * fails: callers skip the suite while the git-ignored clips are absent.
 */
export function scoreReps<S extends Progress, M>(
  ex: ReplayExercise<S, M>,
  reps: Record<string, number>,
): Row[] {
  const files = traceFiles('device');
  return Object.entries(reps).map(([clip, expected]) => {
    const path = files.find((p) => p.endsWith(clip));
    assert(path, `${clip}: no such device clip`);
    const got = replay(ex, loadTrace(path)).reps;
    return { clip, expected, got, ok: got === expected };
  });
}

/** When each rep counted, in seconds of the trace. */
function repTimes<S extends Progress, M>(ex: ReplayExercise<S, M>, path: string): number[] {
  let state = ex.initial;
  return loadTrace(path).frames.flatMap((frame) => {
    const pose = frame.landmarks.length === 0 ? null : ex.measure(toPose(frame));
    const next = ex.step(state, pose, frame.t);
    const counted = next.reps > state.reps;
    state = next;
    return counted ? [frame.t / 1000] : [];
  });
}

/**
 * Device clips labelled from their video, by file name, in trace seconds: each span holds one real
 * rep, and no rep counts outside them. Skips while the git-ignored clips are missing.
 */
export function clipSuite<S extends Progress, M>(
  title: string,
  ex: ReplayExercise<S, M>,
  labels: Record<string, readonly (readonly [number, number])[]>,
) {
  const clips = Object.keys(labels).map((clip) =>
    traceFiles('device').find((path) => path.endsWith(clip)),
  );
  describe.skipIf(clips.some((path) => !path))(`${title} on device clips with gravity`, () => {
    it.each(Object.entries(labels))('%s: counts each real one once', (clip, spans) => {
      const path = clips.find((p) => p?.endsWith(clip));
      assert(path);
      const reps = repTimes(ex, path);
      const inside = spans.map(([from, to]) => reps.filter((t) => t >= from && t <= to).length);
      expect(inside, JSON.stringify(reps)).toEqual(spans.map(() => 1));
      expect(reps, JSON.stringify(reps)).toHaveLength(spans.length);
    });
  });
}
