// A position held while one measure goes down and back up: one rep. The position's setup is judged
// at the top, where the body is at rest; its form on every frame of the rep.
import { BODY_PARTS, type Joints, type Pose, type Side } from '@/exercises/body/geometry';
import { smooth, type Smooth, type Tuning } from '@/exercises/body/smooth';
import type { Measure } from '@/exercises/measures/measure';
import type { Position } from '@/exercises/positions/position';
import { fmtMs, type Counter, type Detector, type Progress, type Rep } from './progress';

export type CycleConfig<M, A, R extends Rep> = {
  /** Null gates the signal, not form accumulation from an otherwise valid sample. */
  signal(m: M): number | null;
  smoothing?: Tuning;
  /** Every value the signal can take; others are dropped. Degrees by default. */
  range?: readonly [number, number];
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

/**
 * One signal, smoothed and held for two samples, cycling waiting -> up -> down -> up.
 * shortcut: exported for the exercises not yet rebuilt on a position, and for sided; make it
 * private to this file once they all use `cycle`.
 */
export function engine<M, A, R extends Rep>(c: CycleConfig<M, A, R>): Counter<CycleState<A, R>, M> {
  // Unit signals (0..1) fit inside the default degrees.
  const [lo, hi] = c.range ?? [0, 180];
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

export type CycleOptions = {
  /** The measure at or past this is the top: where a rep starts and ends. */
  up: number;
  /** Reached this on the way: deep enough to count. */
  down: number;
  /** Moved past this without reaching `down`: a failed rep. */
  shallow: number;
  /** A full rep faster than this is counted, with a cue to slow down. */
  fastMs: number;
  /** Said after a failed rep that was in position but not deep enough: 'Go lower'. */
  deeper: string;
  /**
   * A second measure on the same side that must fall too: past `down` for the bottom, past
   * `shallow` for a failed rep. A squat's hips, so bent knees alone (kneeling, a bend) are no rep.
   */
  also?: { measure: Measure; down: number; shallow: number };
};

/** One frame: the position's reading and the measure on the same side; `also` is NaN unconfigured. */
export type CycleSample<P> = { at: P; value: number; joints: Joints; also: number };

/** The first form cue of the attempt, and the lowest `also`. */
type Attempt = { cue: string | null; also: number };

export type CycleReport = Rep & { depth: number; downMs: number | null; upMs: number | null };

export function cycle<P extends { side: Side }>(
  p: Position<P>,
  m: Measure,
  o: CycleOptions,
): Detector<CycleState<Attempt, CycleReport>, CycleSample<P>> {
  const placed = (s: CycleSample<P>) => p.setup(s.at) === null;
  const good = (s: CycleSample<P>) => placed(s) && p.form(s.at) === null;
  const past = (value: number, limit: 'down' | 'shallow') => !o.also || value <= o.also[limit];
  const counter = engine<CycleSample<P>, Attempt, CycleReport>({
    signal: (s) => s.value,
    range: m.range,
    up: o.up,
    down: o.down,
    shallow: o.shallow,
    start: good,
    // The bottom counts only with good form; setup is not judged mid-movement.
    turn: (s) => p.form(s.at) === null && past(s.also, 'down'),
    // A shallow dip is a failed rep only while still in the position.
    tried: (a, s) => placed(s) && past(a.also, 'shallow'),
    clean: (a, s) => a.cue === null && placed(s),
    fresh: { cue: null, also: Infinity },
    add: (a, s) => ({ cue: a.cue ?? p.form(s.at), also: Math.min(a.also, s.also) }),
    report: (a, s, { counted, depth, downMs, upMs }) => {
      const fast = downMs !== null && upMs !== null && downMs + upMs < o.fastMs;
      const cue = !counted && (p.setup(s.at) ?? a.cue ?? o.deeper);
      const cues = [cue, fast && 'Slow down'].filter((x): x is string => !!x);
      return { counted, cues, depth, downMs, upMs };
    },
  });
  const on = (pose: Pose, at: P, side: Side) => {
    const reading = m.read(pose, side);
    const also = o.also ? o.also.measure.read(pose, side) : { value: NaN };
    return reading && also ? { at, ...reading, also: also.value } : null;
  };
  return {
    ...counter,
    // The position picks its better-seen side at its own visibility bar; when the measure can't be
    // read there (the elbow needs a higher one), the other limb stands in: a cycle moves both alike.
    measure: (pose) => {
      const at = p.read(pose);
      return at && (on(pose, at, at.side) ?? on(pose, at, at.side === 'left' ? 'right' : 'left'));
    },
    ready: p.ready,
    parts: BODY_PARTS.filter((part) =>
      [p.parts, m.parts, o.also?.measure.parts ?? []].some((parts) => parts.includes(part)),
    ),
    gauge: { down: o.down, up: o.up },
    stats: ({ lastRep: r }) =>
      r && `${Math.round(r.depth)}° · ${fmtMs(r.downMs)}↓ ${fmtMs(r.upMs)}↑`,
  };
}
