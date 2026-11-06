import type { Counter, Progress } from './progress';

export type HoldConfig<M> = {
  /** Null = in shape; otherwise the first failing check's cue. */
  check(m: M): string | null;
  enterMs?: number; // default 300
  graceMs?: number; // default 800
  lostCue: string;
};

export type HoldState = Progress & {
  /** Start of the in-shape streak while entering. */
  since: number | null;
  /** Last in-shape frame while active. */
  lastIn: number | null;
  /** Last frame seen; rejects non-monotonic frames. */
  lastAt: number | null;
  /** Latest form cue since the last in-shape frame. */
  cue: string | null;
};

/** A hold clock driven entirely by detector timestamps, including entry and forgiven gaps. */
export function hold<M>(c: HoldConfig<M>): Counter<HoldState, M> {
  const enterMs = c.enterMs ?? 300;
  const graceMs = c.graceMs ?? 800;
  const initial: HoldState = {
    reps: 0,
    noReps: 0,
    heldMs: 0,
    phase: 'waiting',
    broken: false,
    lastRep: null,
    since: null,
    lastIn: null,
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
      lastAt: null,
      cue: null,
    };
  }

  function step(s: HoldState, sample: M | null, nowMs: number): HoldState {
    if (s.lastAt !== null && nowMs <= s.lastAt) return s;
    // Entry also needs observed frames within the grace window.
    if (s.phase === 'waiting' && s.lastAt !== null && nowMs - s.lastAt > graceMs) {
      s = { ...s, since: nowMs };
    }
    const formCue = sample === null ? null : c.check(sample);
    const inShape = sample !== null && formCue === null;
    s = { ...s, lastAt: nowMs, cue: formCue ?? s.cue };

    // Apply a break before accepting a good frame after a detector stall.
    if (s.phase === 'active' && s.lastIn !== null && nowMs - s.lastIn > graceMs) {
      s = {
        ...s,
        phase: 'waiting',
        noReps: s.noReps + 1,
        broken: true,
        lastRep: {
          counted: false,
          cues: [s.cue ?? c.lostCue],
          depth: null,
          upMs: null,
        },
        since: null,
        lastIn: null,
        cue: null,
      };
    }

    if (inShape) {
      if (s.phase === 'active' && s.lastIn !== null) {
        return { ...s, heldMs: s.heldMs + nowMs - s.lastIn, lastIn: nowMs, cue: null };
      }
      const since = s.since ?? nowMs;
      if (nowMs - since >= enterMs) {
        return {
          ...s,
          phase: 'active',
          heldMs: s.heldMs + nowMs - since,
          broken: false,
          since: null,
          lastIn: nowMs,
          cue: null,
        };
      }
      return { ...s, since, cue: null };
    }

    return s.phase === 'waiting' ? { ...s, since: null } : s;
  }

  return {
    kind: 'hold',
    initial,
    step,
    reset,
    live: () => ({ signal: null, lowest: null }),
  };
}
