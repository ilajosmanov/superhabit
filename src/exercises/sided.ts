import { cycle, type CycleConfig, type CycleState } from './cycle';
import type { Counter, Progress, Rep } from './progress';

export type Side = 'left' | 'right';
export type SidedConfig<M, A, R extends Rep> = Omit<CycleConfig<M, A, R>, 'signal'> & {
  /** Null means this side is unseen; never substitute the other side's signal. */
  signal(m: M, side: Side): number | null;
  /** Pair counts one more clean left AND right; side counts every clean side rep. */
  per: 'pair' | 'side';
};
export type SidedState<A, R extends Rep> = Progress & {
  left: CycleState<A, R>;
  right: CycleState<A, R>;
  lastSide: Side | null;
};

/** Two independent cycles sharing an exercise's rules and an explicit counting unit. */
export function sided<M, A, R extends Rep>(c: SidedConfig<M, A, R>): Counter<SidedState<A, R>, M> {
  const left = cycle({ ...c, signal: (m: M) => c.signal(m, 'left') });
  const right = cycle({ ...c, signal: (m: M) => c.signal(m, 'right') });
  type State = SidedState<A, R>;
  const initial: State = {
    reps: 0,
    noReps: 0,
    heldMs: 0,
    phase: 'waiting',
    broken: false,
    lastRep: null,
    left: left.initial,
    right: right.initial,
    lastSide: null,
  };

  function step(s: State, sample: M | null, nowMs: number): State {
    const l = left.step(s.left, sample, nowMs);
    const r = right.step(s.right, sample, nowMs);
    if (l === s.left && r === s.right) return s;

    // Completions take precedence over phase changes; report objects may be reused.
    // shortcut: two sides finishing on one frame report one lastRep (right wins);
    // add a reports list if the strip needs both.
    const reported =
      r.reps + r.noReps !== s.right.reps + s.right.noReps
        ? 'right'
        : l.reps + l.noReps !== s.left.reps + s.left.noReps
          ? 'left'
          : null;
    const lastSide =
      reported ??
      (r.phase !== s.right.phase ? 'right' : l.phase !== s.left.phase ? 'left' : s.lastSide);
    const latest = lastSide === 'right' ? r : l;
    // One side expiring must not hide the other side's active cycle.
    const phase =
      latest.phase !== 'waiting' ? latest.phase : l.phase !== 'waiting' ? l.phase : r.phase;
    return {
      ...s,
      left: l,
      right: r,
      lastSide,
      reps: c.per === 'pair' ? Math.min(l.reps, r.reps) : l.reps + r.reps,
      noReps: l.noReps + r.noReps,
      phase,
      lastRep: reported === 'right' ? r.lastRep : reported === 'left' ? l.lastRep : s.lastRep,
    };
  }

  return {
    kind: 'sided',
    initial,
    step,
    reset: (s) => ({
      ...s,
      left: left.reset(s.left),
      right: right.reset(s.right),
      phase: 'waiting',
      broken: false,
      lastSide: null,
    }),
    live: (s) => {
      // A shallow attempt need not change phase. Prefer its current signal to a stale
      // reading from the side that last changed phase, while keeping waiting sides out.
      if (
        s.left.phase !== 'waiting' &&
        (s.left.lastSeenAt ?? -Infinity) > (s.right.lastSeenAt ?? -Infinity)
      )
        return left.live(s.left);
      if (
        s.right.phase !== 'waiting' &&
        (s.right.lastSeenAt ?? -Infinity) > (s.left.lastSeenAt ?? -Infinity)
      )
        return right.live(s.right);
      const latest = s.lastSide === 'right' ? s.right : s.left;
      if (latest.phase === 'waiting') {
        if (s.left.phase !== 'waiting') return left.live(s.left);
        if (s.right.phase !== 'waiting') return right.live(s.right);
      }
      if (s.lastSide === 'left') return left.live(s.left);
      if (s.lastSide === 'right') return right.live(s.right);
      return { signal: null, lowest: null };
    },
  };
}
