// One signal, smoothed and held for two samples, cycling waiting -> up -> down -> up.
import type { Counter, Progress, Rep } from './progress';
import { smooth, type Smooth, type Tuning } from '@/exercises/body/smooth';

export type CycleConfig<M, A, R extends Rep> = {
  /** Null gates the signal, not form accumulation from an otherwise valid sample. */
  signal(m: M): number | null;
  smoothing?: Tuning;
  up: number;
  down: number;
  shallow: number;
  start?(m: M): boolean;
  turn?(m: M): boolean;
  fresh: A;
  add(a: A, m: M): A;
  clean?(a: A, m: M): boolean;
  tried?(a: A, m: M): boolean;
  report(
    a: A,
    m: M,
    r: {
      counted: boolean;
      depth: number;
      downMs: number | null;
      upMs: number | null;
      /** Frames of the attempt without a measurement: the body left the frame. */
      unseen: number;
    },
  ): R;
};
type Timing = { startAt?: number; bottomAt?: number; unseen?: number };
export type CycleState<A, R extends Rep> = Progress & {
  lastRep: R | null;
  min: number; // extreme since the last top in normalised space; hi = none
  lastSeenAt?: number;
  filter?: Smooth;
  prev?: number;
  attempt: A & Timing;
};

const TRACKING_TIMEOUT_MS = 1000;

/** Down and up durations of an attempt ending on the detector clock. */
function timing(a: Timing, nowMs: number) {
  const downMs =
    a.bottomAt !== undefined && a.startAt !== undefined ? a.bottomAt - a.startAt : null;
  const upMs = a.bottomAt !== undefined ? nowMs - a.bottomAt : null;
  return { downMs, upMs };
}

export function cycle<M, A, R extends Rep>(c: CycleConfig<M, A, R>): Counter<CycleState<A, R>, M> {
  // Signals are degrees, 0..180; unit signals (0..1) fit inside it.
  const [lo, hi] = [0, 180];
  // Identity for falling signals preserves the angle counters' operation order exactly.
  const mirror = (x: number) => (c.down > c.up ? lo + hi - x : x);
  const up = mirror(c.up);
  const down = mirror(c.down);
  const shallow = mirror(c.shallow);
  type State = CycleState<A, R>;
  const fresh = (at?: number): A & Timing => ({ ...c.fresh, startAt: at });
  const initial: State = {
    reps: 0,
    noReps: 0,
    heldMs: 0,
    phase: 'waiting',
    broken: false,
    min: hi,
    lastRep: null,
    attempt: fresh(),
  };

  function reset(s: State): State {
    return {
      ...s,
      phase: 'waiting',
      broken: false,
      min: hi,
      lastSeenAt: undefined,
      filter: undefined,
      prev: undefined,
      attempt: fresh(),
    };
  }

  /** Drop the filter and require the start again after a tracking gap. */
  function expire(s: State, nowMs: number): State {
    if (
      s.lastSeenAt === undefined ||
      nowMs - s.lastSeenAt <= TRACKING_TIMEOUT_MS ||
      (s.phase === 'waiting' && !s.filter)
    )
      return s;
    return { ...s, phase: 'waiting', min: hi, filter: undefined, prev: undefined };
  }

  /** A threshold needs two consecutive smoothed samples beyond it. */
  function hold(s: State, value: number | null, nowMs: number) {
    if (value === null || !Number.isFinite(value) || value < lo || value > hi) return null;
    const filter = smooth(s.filter, mirror(value), nowMs / 1000, c.smoothing);
    return {
      s: { ...s, filter, prev: filter.x, lastSeenAt: nowMs },
      low: Math.max(filter.x, s.prev ?? NaN),
      high: Math.min(filter.x, s.prev ?? NaN),
    };
  }

  function step(s: State, sample: M | null, nowMs: number): State {
    if (s.lastSeenAt !== undefined && nowMs <= s.lastSeenAt) return s;
    s = expire(s, nowMs);
    if (sample === null)
      return s.phase === 'waiting'
        ? s
        : { ...s, attempt: { ...s.attempt, unseen: (s.attempt.unseen ?? 0) + 1 } };
    const signal = c.signal(sample);
    // A gated signal can still carry form (e.g. torso lean as a lunge stride closes).
    // Keep the signal's tracking clock and filter untouched; unseen time still expires the cycle.
    if (signal === null)
      return s.phase === 'waiting'
        ? s
        : {
            ...s,
            attempt: {
              ...c.add(s.attempt, sample),
              startAt: s.attempt.startAt,
              bottomAt: s.attempt.bottomAt,
              unseen: s.attempt.unseen,
            },
          };
    const held = hold(s, signal, nowMs);
    if (!held) return s;
    const { low, high } = held;
    s = held.s;
    if (s.phase === 'waiting')
      return high >= up && (c.start?.(sample) ?? true)
        ? { ...s, phase: 'up', min: hi, attempt: fresh(nowMs) }
        : s;

    const attempt: A & Timing = {
      ...c.add(s.attempt, sample),
      startAt: s.attempt.startAt,
      bottomAt: low < s.min ? nowMs : s.attempt.bottomAt,
      unseen: s.attempt.unseen,
    };
    const min = Math.min(s.min, low);
    if (high >= up) {
      const done: State = { ...s, phase: 'up', min: hi, attempt: fresh(nowMs) };
      const turned = s.phase === 'down';
      if (turned || (min < shallow && (c.tried?.(attempt, sample) ?? true))) {
        const counted = turned && (c.clean?.(attempt, sample) ?? true);
        return {
          ...done,
          reps: s.reps + Number(counted),
          noReps: s.noReps + Number(!counted),
          lastRep: c.report(attempt, sample, {
            counted,
            depth: mirror(min),
            ...timing(attempt, nowMs),
            unseen: attempt.unseen ?? 0,
          }),
        };
      }
      return { ...s, min: hi, attempt: fresh(nowMs) };
    }
    if (low <= down && (c.turn?.(sample) ?? true)) return { ...s, phase: 'down', min, attempt };
    return { ...s, min, attempt };
  }

  return {
    kind: 'cycle',
    initial,
    step,
    reset,
    live: (s) => ({
      signal: s.filter ? mirror(s.filter.x) : null,
      lowest: s.phase === 'waiting' || s.min >= hi ? null : mirror(s.min),
    }),
  };
}
