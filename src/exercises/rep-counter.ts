// What every rep counter shares: one joint angle, smoothed and held for two samples, cycling
// waiting -> up -> down -> up. Each exercise keeps its own measure, rep rules and cues.
import { smooth, type Smooth } from './smooth';

/** 'waiting' = not seen in the start position since starting or losing tracking; nothing counts. */
export type Phase = 'waiting' | 'up' | 'down';
/** When the attempt started and when it hit its lowest angle; exercises add their own form data. */
type Timing = { startAt?: number; bottomAt?: number };

/** Plain data: a step never mutates it, so any state can be stepped again or replayed. */
export type RepState<A extends Timing, R> = {
  reps: number;
  noReps: number;
  phase: Phase;
  min: number; // lowest held angle since the last top
  lastRep: R | null;
  lastSeenAt?: number; // monotonic time of the last valid angle
  filter?: Smooth;
  prev?: number; // previous smoothed angle, for the two-sample hold
  attempt: A;
};
type AnyRepState = RepState<Timing, unknown>;

// Tolerate brief dropouts, but require the start position again after losing tracking.
const TRACKING_TIMEOUT_MS = 1000;

export const initialRepState = <A extends Timing, R>(attempt: A): RepState<A, R> => ({
  reps: 0,
  noReps: 0,
  phase: 'waiting',
  min: 180,
  lastRep: null,
  attempt,
});

/** Drops the attempt and the filter once tracking has been lost for longer than the timeout. */
export function expire<S extends AnyRepState>(s: S, nowMs: number): S {
  if (
    s.lastSeenAt === undefined ||
    nowMs - s.lastSeenAt <= TRACKING_TIMEOUT_MS ||
    (s.phase === 'waiting' && !s.filter)
  )
    return s;
  return { ...s, phase: 'waiting', min: 180, filter: undefined, prev: undefined };
}

/**
 * Smooths a valid angle (0–180°) into `s`. A threshold only counts once two consecutive samples
 * are past it: `low` is the angle to compare with "down" thresholds, `high` with "up" ones
 * (NaN: no previous sample yet). Null for an invalid angle; the caller keeps its state.
 */
export function hold<S extends AnyRepState>(s: S, deg: number | null, nowMs: number) {
  if (deg === null || !Number.isFinite(deg) || deg < 0 || deg > 180) return null;
  const filter = smooth(s.filter, deg, nowMs / 1000);
  return {
    s: { ...s, filter, prev: filter.x, lastSeenAt: nowMs },
    low: Math.max(filter.x, s.prev ?? NaN),
    high: Math.min(filter.x, s.prev ?? NaN),
  };
}

/** Down and up durations of an attempt ending at `nowMs` (null without its timestamps); `fast` = full rep under `fastMs`. */
export function timing(a: Timing, nowMs: number, fastMs: number) {
  const downMs =
    a.bottomAt !== undefined && a.startAt !== undefined ? a.bottomAt - a.startAt : null;
  const upMs = a.bottomAt !== undefined ? nowMs - a.bottomAt : null;
  return { downMs, upMs, fast: downMs !== null && upMs !== null && downMs + upMs < fastMs };
}
