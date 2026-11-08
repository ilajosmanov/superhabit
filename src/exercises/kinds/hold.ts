import type { Position } from '@/exercises/positions/position';
import type { Counter, Progress } from './progress';

/** A hold needs only the position's judgement and its tracking-loss cue. */
export type HoldConfig<M> = Pick<Position<M>, 'fit' | 'lost'>;

const ENTER_MS = 300;
const GRACE_MS = 800;

export type HoldState = Progress & {
  /** Start of the in-shape streak while entering. */
  since: number | null;
  /** Last in-shape frame (in the position, good form) while active. */
  lastIn: number | null;
  /** Last frame still in the position, good form or not, while active. */
  lastPlaced: number | null;
  /** Form has been off past the grace: the slip is counted and the clock waits for good form. */
  slipped: boolean;
  /** Last frame seen; rejects non-monotonic frames. */
  lastAt: number | null;
  /** Latest form cue since the last in-shape frame. */
  cue: string | null;
};

/**
 * A hold clock driven entirely by detector timestamps, including entry and forgiven gaps.
 * Leaving the position breaks the hold; poor form inside it only pauses the clock and says the cue.
 */
export function hold<M>(c: HoldConfig<M>): Counter<HoldState, M> {
  const initial: HoldState = {
    reps: 0,
    noReps: 0,
    heldMs: 0,
    phase: 'waiting',
    broken: false,
    lastRep: null,
    since: null,
    lastIn: null,
    lastPlaced: null,
    slipped: false,
    lastAt: null,
    cue: null,
  };

  function reset(s: HoldState): HoldState {
    return {
      ...s,
      phase: 'waiting',
      broken: false,
      since: null,
      lastIn: null,
      lastPlaced: null,
      slipped: false,
      lastAt: null,
      cue: null,
    };
  }

  /** A failed attempt for the runner: counted in noReps, its cue said once. */
  const miss = (cue: string) => ({ counted: false, cues: [cue], depth: null, upMs: null });

  function step(s: HoldState, sample: M | null, nowMs: number): HoldState {
    if (s.lastAt !== null && nowMs <= s.lastAt) return s;
    // Entry also needs observed frames within the grace window.
    if (s.phase === 'waiting' && s.lastAt !== null && nowMs - s.lastAt > GRACE_MS) {
      s = { ...s, since: nowMs };
    }
    const fit = sample === null ? null : c.fit(sample);
    const inShape = sample !== null && fit === null;
    const placed = sample !== null && (fit === null || !fit.out);
    s = { ...s, lastAt: nowMs, cue: fit?.cue ?? s.cue };

    // Apply a break before accepting a good frame after a detector stall.
    if (s.phase === 'active' && s.lastPlaced !== null && nowMs - s.lastPlaced > GRACE_MS) {
      s = {
        ...s,
        phase: 'waiting',
        noReps: s.noReps + 1,
        broken: true,
        lastRep: miss(s.cue ?? c.lost),
        since: null,
        lastIn: null,
        lastPlaced: null,
        slipped: false,
        cue: null,
      };
    }
    // Still in the position, but not in shape for longer than the grace: count the slip once.
    if (s.phase === 'active' && !s.slipped && s.lastIn !== null && nowMs - s.lastIn > GRACE_MS) {
      s = { ...s, noReps: s.noReps + 1, slipped: true, lastRep: miss(s.cue ?? c.lost) };
    }

    if (inShape) {
      if (s.phase === 'active' && s.lastIn !== null) {
        // A short gap is forgiven and credited; after a slip the clock resumes from this frame.
        const credit = s.slipped ? 0 : nowMs - s.lastIn;
        return {
          ...s,
          heldMs: s.heldMs + credit,
          lastIn: nowMs,
          lastPlaced: nowMs,
          slipped: false,
          cue: null,
        };
      }
      const since = s.since ?? nowMs;
      if (nowMs - since >= ENTER_MS) {
        return {
          ...s,
          phase: 'active',
          heldMs: s.heldMs + nowMs - since,
          broken: false,
          since: null,
          lastIn: nowMs,
          lastPlaced: nowMs,
          slipped: false,
          cue: null,
        };
      }
      return { ...s, since, cue: null };
    }

    if (s.phase === 'waiting') return { ...s, since: null };
    return placed ? { ...s, lastPlaced: nowMs } : s;
  }

  return {
    kind: 'hold',
    initial,
    step,
    reset,
    live: () => ({ signal: null, lowest: null }),
  };
}
