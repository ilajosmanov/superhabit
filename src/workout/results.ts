import type { ExerciseId } from '@/exercises/registry';
import type { Goal } from './plan';

/** Where a filmed rep sits: its file and the rep's bottom on that file's timeline. */
export type Clip = { uri: string; atMs: number };

/** `cue`: the first form cue, if any; `clip`: where the rep's bottom is filmed, absent when it was not. */
export type Attempt = { counted: boolean; depth: number; cue: string | null; clip?: Clip };
export type StepResult = {
  day: number;
  exercise: ExerciseId;
  round: number;
  /** Wall-clock timestamps, separate from the detector clock used for reps and holds. */
  startedAt: number;
  endedAt: number;
  name: string;
  goal: Goal;
  gauge: { down: number; up: number } | null;
  reps: number;
  noReps: number;
  heldMs: number;
  attempts: readonly Attempt[];
  stats: string | null;
};

/** The deepest counted rep that was filmed. `rep` is its 1-based number among its set's counted reps. */
export type BestRep = Clip & { exercise: ExerciseId; name: string; rep: number; depth: number };

/**
 * The rep's bottom on its file's timeline. Every time is a detector frame timestamp (CameraX sensor clock,
 * ms); `startMs` is the first frame JS saw after the recorder reported started, so it runs a frame or so
 * late and the result lands slightly early, inside the clip's lead-in. Negative: before the file started.
 */
export const clipTime = (startMs: number, countedAtMs: number, upMs: number | null) =>
  countedAtMs - (upMs ?? 0) - startMs;

/**
 * Deepest filmed counted rep by its margin past its exercise's `down`, for rising or falling gauges;
 * first wins ties. Exercises without a gauge have no comparable depth.
 */
export function bestRep(sets: readonly StepResult[]): BestRep | null {
  let best: BestRep | null = null;
  let margin = Infinity;
  for (const { exercise, name, gauge, attempts } of sets) {
    if (!gauge) continue;
    const { down, up } = gauge;
    let rep = 0;
    for (const { counted, depth, clip } of attempts) {
      if (!counted) continue;
      rep++;
      const past = (depth - down) * Math.sign(up - down);
      if (clip && past < margin) {
        best = { ...clip, exercise, name, rep, depth };
        margin = past;
      }
    }
  }
  return best;
}
