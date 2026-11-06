// shortcut: no exercise registers on this kind yet; burpee is the first consumer. Delete if burpee lands on another kind.
import type { Counter, Progress } from './progress';

export type SequenceConfig<M, P extends string> = {
  /** Null means none of the named poses, including transitions between them. */
  pose(m: M): P | null;
  /** The first pose starts a sequence; returning to it after the last counts a rep. */
  order: readonly [P, P, ...P[]];
  maxStepMs: number;
  cue(missed: P): string;
};

export type SequenceState<P extends string> = Progress & {
  next: number;
  stepAt: number | null;
  lastSeenAt?: number;
  candidate: { pose: P; n: number } | null;
};

const TRACKING_TIMEOUT_MS = 1000;

/** Named poses confirmed on two consecutive detector frames, in order. */
export function sequence<M, P extends string>(
  c: SequenceConfig<M, P>,
): Counter<SequenceState<P>, M> {
  type State = SequenceState<P>;
  const initial: State = {
    reps: 0,
    noReps: 0,
    heldMs: 0,
    phase: 'waiting',
    broken: false,
    lastRep: null,
    next: 0,
    stepAt: null,
    candidate: null,
  };

  function reset(s: State): State {
    return {
      ...s,
      phase: 'waiting',
      broken: false,
      next: 0,
      stepAt: null,
      lastSeenAt: undefined,
      candidate: null,
    };
  }

  function fail(s: State): State {
    return {
      ...reset(s),
      lastSeenAt: s.lastSeenAt,
      noReps: s.noReps + 1,
      lastRep: {
        counted: false,
        cues: [c.cue(c.order[s.next] ?? c.order[0])],
        depth: null,
        upMs: null,
      },
    };
  }

  function step(s: State, sample: M | null, nowMs: number): State {
    if (s.lastSeenAt !== undefined && nowMs <= s.lastSeenAt) return s;
    // Expire before checking the pose deadline: unseen time is not a failed attempt.
    if (s.lastSeenAt !== undefined && nowMs - s.lastSeenAt > TRACKING_TIMEOUT_MS) {
      s = reset(s);
    }
    if (sample === null) return { ...s, candidate: null };
    s = { ...s, lastSeenAt: nowMs };

    const pose = c.pose(sample);
    if (s.phase !== 'waiting' && s.stepAt !== null && nowMs - s.stepAt > c.maxStepMs) {
      return fail(s);
    }
    // Holding the start is idle, but returning to it cannot erase an overdue transition.
    if (s.phase === 'up' && pose === c.order[0]) s = { ...s, stepAt: nowMs };

    if (pose === null) return { ...s, candidate: null };
    const candidate = { pose, n: s.candidate?.pose === pose ? Math.min(s.candidate.n + 1, 2) : 1 };
    s = { ...s, candidate };
    if (candidate.n < 2) return s;

    if (s.phase === 'waiting') {
      return pose === c.order[0] ? { ...s, phase: 'up', next: 1, stepAt: nowMs } : s;
    }

    const previous = c.order[s.next === 0 ? c.order.length - 1 : s.next - 1];
    if (pose === previous) return s;
    if (pose !== c.order[s.next]) return fail(s);

    if (s.next === 0) {
      return {
        ...s,
        phase: 'up',
        next: 1,
        stepAt: nowMs,
        reps: s.reps + 1,
        lastRep: { counted: true, cues: [], depth: null, upMs: null },
      };
    }
    return {
      ...s,
      phase: 'active',
      next: (s.next + 1) % c.order.length,
      stepAt: nowMs,
    };
  }

  return {
    kind: 'sequence',
    initial,
    step,
    reset,
    live: () => ({ signal: null, lowest: null }),
  };
}
