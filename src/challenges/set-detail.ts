import { past, type Gauge } from '@/lib/depth';
import type { Attempt } from '@/workout/plan/results';

type Kept = { reps: number; noReps: number; heldMs: number; attempts: readonly Attempt[] };

function median(values: readonly number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * A set up close: what it got, every attempt in order, the typical clean rep (its median down and up
 * times, or its whole time when the kind has no bottom) and the deepest one, and each no-rep with its
 * number and call. A daily total's tries come as several sets, oldest first: they read as one.
 */
export function setDetail(kept: readonly Kept[], gauge: Gauge | null) {
  const attempts = kept.flatMap((set) => set.attempts);
  const clean = attempts.filter((attempt) => attempt.counted);
  const bottomed = clean.flatMap(({ startMs, bottomMs, endMs }) =>
    bottomMs === null ? [] : [{ down: bottomMs - startMs, up: endMs - bottomMs }],
  );
  const depths = clean.flatMap(({ depth }) => (depth === null ? [] : [depth]));
  return {
    reps: kept.reduce((sum, set) => sum + set.reps, 0),
    noReps: kept.reduce((sum, set) => sum + set.noReps, 0),
    heldMs: kept.reduce((sum, set) => sum + set.heldMs, 0),
    attempts,
    // Either way a measure moves (elbows close, hips rise): the one furthest from the start position.
    deepest:
      gauge && depths.length
        ? depths.reduce((a, b) => (past(b, gauge) > past(a, gauge) ? b : a))
        : null,
    downMs: median(bottomed.map(({ down }) => down)),
    upMs: median(bottomed.map(({ up }) => up)),
    /** Only for a kind without a bottom (a burpee): start to end. */
    repMs: bottomed.length ? null : median(clean.map(({ startMs, endMs }) => endMs - startMs)),
    misses: attempts.flatMap((attempt, i) => (attempt.counted ? [] : [{ ...attempt, n: i + 1 }])),
  };
}
