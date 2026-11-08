import { EXERCISES, type ExerciseId } from '@/exercises/registry';
import type { FlatSteps, Goal } from './plan';

/** Where a filmed rep sits: its file and the rep's bottom on that file's timeline. */
// shortcut: clip URIs live in Paths.cache/reps, which the camcorder prunes on every start; persisting a result must move its best clip to Paths.document or drop clips.
type Clip = { uri: string; atMs: number };

/** `cue`: the first form cue, if any; `clip`: where the rep's bottom is filmed, absent when it was not. */
export type Attempt = { counted: boolean; depth: number; cue: string | null; clip?: Clip };
export type StepResult = {
  exercise: ExerciseId;
  round: number;
  /** Wall-clock timestamps, separate from the detector clock used for reps and holds. */
  startedAt: number;
  endedAt: number;
  goal: Goal;
  reps: number;
  noReps: number;
  heldMs: number;
  attempts: readonly Attempt[];
  // shortcut: stats is a formatted string; keep the numbers when results persist.
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
 * Deepest filmed counted rep by how far past its exercise's `down` it went, in gauge spans so a
 * jumping jack's 0..1 spread compares with a squat's degrees; first wins ties. Exercises without
 * a gauge have no comparable depth.
 */
export function bestRep(sets: readonly StepResult[]): BestRep | null {
  let best: BestRep | null = null;
  let margin = Infinity;
  for (const { exercise, attempts } of sets) {
    const { name, gauge } = EXERCISES[exercise];
    if (!gauge) continue;
    const { down, up } = gauge;
    let rep = 0;
    for (const { counted, depth, clip } of attempts) {
      if (!counted) continue;
      rep++;
      const past = (depth - down) / (up - down);
      if (clip && past < margin) {
        best = { ...clip, exercise, name, rep, depth };
        margin = past;
      }
    }
  }
  return best;
}

/**
 * How much of the day's session was done, 0 to 1: each exercise set's share of its goal (an open-ended set
 * counts in full once anything was done), averaged over every set, so one skipped or never reached is 0.
 * 1 means every goal was met.
 */
export function shareDone(steps: FlatSteps, results: readonly StepResult[]) {
  const sets = steps.filter((step) => step.exercise !== 'rest').length;
  const done = results.reduce((sum, { goal, reps, heldMs }) => {
    if (goal.type === 'max') return sum + (reps > 0 || heldMs > 0 ? 1 : 0);
    const amount = goal.type === 'reps' ? reps : heldMs / 1000;
    return sum + Math.min(1, amount / goal.n);
  }, 0);
  return done / sets;
}
