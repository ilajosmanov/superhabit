import { cycle, type CycleConfig, type CycleState } from './cycle';
import type { Side } from './geometry';
import type { Counter, Progress, Rep } from './progress';

export type SidedConfig<M, A, R extends Rep> = Omit<CycleConfig<M, A, R>, 'signal'> & {
  /** Null means this side is unseen; never substitute the other side's signal. */
  signal(m: M, side: Side): number | null;
};
export type SidedState<A, R extends Rep> = Progress & {
  lastRep: R | null;
  left: CycleState<A, R>;
  right: CycleState<A, R>;
  lastSide: Side | null;
};

/** Two independent cycles sharing an exercise's rules; every clean side rep counts. */
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
      reps: l.reps + r.reps,
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
      const sides = { left, right };
      // Of the sides in a cycle: the one seen last, then the deeper one (a leg driving down beats
      // one resting at the top on the same frame), then the last to change phase.
      const [side] = (['left', 'right'] as const)
        .filter((side) => s[side].phase !== 'waiting')
        .sort(
          (a, b) =>
            (s[b].lastSeenAt ?? -Infinity) - (s[a].lastSeenAt ?? -Infinity) ||
            s[a].min - s[b].min ||
            Number(b === s.lastSide) - Number(a === s.lastSide),
        );
      const shown = side ?? s.lastSide;
      return shown ? sides[shown].live(s[shown]) : { signal: null, lowest: null };
    },
  };
}
