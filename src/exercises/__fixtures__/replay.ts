import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { assert, describe, expect, it } from 'vite-plus/test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pose } from '@/exercises/body/geometry';
import type { Progress } from '@/exercises/kinds/progress';
import {
  decodeTrace,
  type RecordedFrame,
  type TraceFrame,
  type TraceHeader,
  type TracePoint,
} from '@/storage/trace-file';

type ReplayExercise<S extends Progress, M> = {
  initial: S;
  reset(s: S): S;
  step(s: S, sample: M | null, nowMs: number): S;
  measure(pose: Pose): M | null;
};

/** A recorded frame's dots as the counters read them. */
export function toPose(frame: TraceFrame): Pose {
  const landmark = ([x, y, z, visibility]: TracePoint) => ({ x, y, z, visibility });
  return {
    landmarks: frame.landmarks.map(landmark),
    worldLandmarks: frame.world.map(landmark),
    ...(frame.down && { down: { x: frame.down[0], y: frame.down[1], z: frame.down[2] } }),
  };
}

let missingReported = false;
const reportMissing = () => {
  if (missingReported) return;
  missingReported = true;
  console.info(
    '[clips] Recorded traces are missing; see src/exercises/README.md for where to get __fixtures__/traces/.',
  );
};

/** List eagerly, decode lazily: missing data skips, present but malformed data fails. */
export function traceFiles(
  exercise: string,
  tracesRoot = fileURLToPath(new URL('./traces/', import.meta.url)),
): string[] {
  const directory = join(tracesRoot, exercise);
  if (!existsSync(directory)) {
    reportMissing();
    return [];
  }
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sht'))
    .map((entry) => join(directory, entry.name))
    .sort();
  if (files.length === 0) reportMissing();
  return files;
}

export function loadTrace(path: string) {
  return decodeTrace(readFileSync(path));
}

type ReplayTrace = {
  frames: readonly (TraceFrame & Partial<Pick<RecordedFrame, 'waiting'>>)[];
  header?: Pick<TraceHeader, 'stretches'>;
};

/** The same frame walk drives both totals and the clip suite's rep timestamps. */
function* replaySteps<S extends Progress, M>(ex: ReplayExercise<S, M>, trace: ReplayTrace) {
  const stretches = trace.header?.stretches;
  const pauses = stretches?.filter((stretch) => stretch.kind === 'paused') ?? [];
  let pause = 0;
  let state = ex.initial;
  for (const frame of trace.frames) {
    // Session events use the last frame's time: reset after that frame, keeping accumulated totals.
    while (pause < pauses.length && pauses[pause].startMs < frame.t) {
      state = ex.reset(state);
      pause++;
    }
    if (stretches) {
      const live = stretches.some(
        (stretch) =>
          (stretch.kind === 'waiting' || stretch.kind === 'counting') &&
          frame.t >= stretch.startMs &&
          frame.t <= stretch.endMs,
      );
      // Touching endpoints can also belong to countdown/pause; the frame records which side saw it.
      // 'counter suspended' is session.ts's waiting reason for the frame that pauses the counter.
      if (!live || frame.waiting === 'counter suspended') continue;
    }
    const previous = state;
    state = ex.step(
      state,
      frame.landmarks.length === 0 ? null : ex.measure(toPose(frame)),
      frame.t,
    );
    yield { frame, previous, state };
  }
}

/** Detector timestamps drive the real measurement and counter, including tracking loss. */
export function replay<S extends Progress, M>(ex: ReplayExercise<S, M>, trace: ReplayTrace): S {
  let state = ex.initial;
  for (const step of replaySteps(ex, trace)) state = step.state;
  return state;
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
  const times: number[] = [];
  for (const { frame, previous, state } of replaySteps(ex, loadTrace(path)))
    if (state.reps > previous.reps) times.push(frame.t / 1000);
  return times;
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
  if (clips.some((path) => !path)) reportMissing();
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
