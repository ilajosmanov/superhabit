import type { SetResult } from './session';

/** Where a filmed rep sits: its file and the rep's bottom on that file's timeline. */
export type Clip = { uri: string; atMs: number };

/** The deepest counted rep that was filmed. `rep` is its 1-based number among its set's counted reps. */
export type BestRep = Clip & { name: string; rep: number; depth: number };

/**
 * The rep's bottom on its file's timeline. Every time is a detector frame timestamp (CameraX sensor clock,
 * ms); `startMs` is the first frame JS saw after the recorder reported started, so it runs a frame or so
 * late and the result lands slightly early, inside the clip's lead-in. Negative: before the file started.
 */
export const clipTime = (startMs: number, countedAtMs: number, upMs: number | null) =>
  countedAtMs - (upMs ?? 0) - startMs;

/**
 * Deepest of every set's filmed counted reps, by how far its depth (min joint angle, lower = deeper) went
 * past its own exercise's `down`, so a squat and a push-up compare fairly; first wins ties.
 */
export function bestRep(sets: readonly SetResult[]): BestRep | null {
  let best: BestRep | null = null;
  let margin = Infinity;
  for (const { name, down, attempts } of sets) {
    let rep = 0;
    for (const { counted, depth, clip } of attempts) {
      if (!counted) continue;
      rep++;
      if (clip && depth - down < margin) {
        best = { ...clip, name, rep, depth };
        margin = depth - down;
      }
    }
  }
  return best;
}
