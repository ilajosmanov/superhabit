// A position held while one measure goes down and back up: one rep. The position's setup is judged
// at the top, where the body is at rest; its form on every frame of the rep.
import { BODY_PARTS, type Joints, type Pose, type Side } from '@/exercises/body/geometry';
import { smooth, type Smooth } from '@/exercises/body/smooth';
import type { Measure } from '@/exercises/measures/measure';
import type { Position } from '@/exercises/positions/position';
import { fmtMs, type Counter, type Detector, type Progress, type Rep } from './progress';

export type CycleConfig<M, A, R extends Rep> = {
  signal(m: M): number;
  /** Every value the signal can take; others are dropped. Degrees by default. */
  range?: readonly [number, number];
  up: number;
  down: number;
  shallow: number;
  start?(m: M): boolean;
  turn?(m: M): boolean;
  /** Back at the top, the attempt ends only once this holds too. */
  top?(m: M): boolean;
  /** The cue for a bad position at the top, between reps; null when it is good. */
  rest?(m: M): string | null;
  fresh: A;
  add(a: A, m: M): A;
  clean?(a: A, m: M): boolean;
  tried?(a: A, m: M): boolean;
  report(
    a: A,
    m: M,
    r: {
      startMs: number | null;
      bottomMs: number | null;
      endMs: number;
      counted: boolean;
      depth: number;
      downMs: number | null;
      upMs: number | null;
    },
  ): R;
};
type Timing = { startAt?: number; bottomAt?: number };
export type CycleState<A, R extends Rep> = Progress & {
  lastRep: R | null;
  min: number; // extreme since the last top in normalised space; hi = none
  lastSeenAt?: number;
  filter?: Smooth;
  prev?: number;
  attempt: A & Timing;
  /** What `rest` reads at the top, and since when. */
  resting?: { cue: string | null; since: number };
};

const TRACKING_TIMEOUT_MS = 1000;
// A hold's grace: a position at the top is told once it has lasted this long, good or bad.
const REST_MS = 800;

/** Detector-clock boundaries and down/up durations of a completed attempt. */
function timing(a: Timing, nowMs: number) {
  const downMs =
    a.bottomAt !== undefined && a.startAt !== undefined ? a.bottomAt - a.startAt : null;
  const upMs = a.bottomAt !== undefined ? nowMs - a.bottomAt : null;
  return { startMs: a.startAt ?? null, bottomMs: a.bottomAt ?? null, endMs: nowMs, downMs, upMs };
}

/**
 * One signal, smoothed and held for two samples, cycling waiting -> up -> down -> up. Exported for
 * its own tests; exercises use `cycle`.
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
      resting: undefined,
      told: null,
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
    return {
      ...s,
      phase: 'waiting',
      min: hi,
      filter: undefined,
      prev: undefined,
      resting: undefined,
      told: null,
    };
  }

  /** Between reps at the top: `told` follows what the position has read for REST_MS. */
  function rest(s: State, sample: M, nowMs: number): Pick<State, 'resting' | 'told'> {
    const cue = c.rest?.(sample) ?? null;
    const resting = s.resting?.cue === cue ? s.resting : { cue, since: nowMs };
    return { resting, told: nowMs - resting.since >= REST_MS ? cue : s.told };
  }

  /** A threshold needs two consecutive smoothed samples beyond it. */
  function hold(s: State, value: number, nowMs: number) {
    if (!Number.isFinite(value) || value < lo || value > hi) return null;
    const filter = smooth(s.filter, mirror(value), nowMs / 1000);
    return {
      s: { ...s, filter, prev: filter.x, lastSeenAt: nowMs },
      low: Math.max(filter.x, s.prev ?? NaN),
      high: Math.min(filter.x, s.prev ?? NaN),
    };
  }

  function step(s: State, sample: M | null, nowMs: number): State {
    if (s.lastSeenAt !== undefined && nowMs <= s.lastSeenAt) return s;
    s = expire(s, nowMs);
    if (sample === null) return s;
    const held = hold(s, c.signal(sample), nowMs);
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
    };
    const min = Math.min(s.min, low);
    if (high >= up && (c.top?.(sample) ?? true)) {
      const done: State = { ...s, phase: 'up', min: hi, attempt: fresh(nowMs), resting: undefined };
      const turned = s.phase === 'down';
      if (turned || (min < shallow && (c.tried?.(attempt, sample) ?? true))) {
        const counted = turned && (c.clean?.(attempt, sample) ?? true);
        const lastRep = c.report(attempt, sample, {
          counted,
          depth: mirror(min),
          ...timing(attempt, nowMs),
        });
        const cue = c.rest?.(sample) ?? null;
        return {
          ...done,
          // A failed rep's first cue is said; the same position at the top is not told again.
          told: cue === null || (!counted && lastRep.cues[0] === cue) ? cue : s.told,
          reps: s.reps + Number(counted),
          noReps: s.noReps + Number(!counted),
          lastRep,
        };
      }
      return { ...s, min: hi, attempt: fresh(nowMs), ...rest(s, sample, nowMs) };
    }
    // Moving: what the top read before no longer counts towards REST_MS.
    if (low <= down && (c.turn?.(sample) ?? true))
      return { ...s, phase: 'down', min, attempt, resting: undefined };
    return { ...s, min, attempt, resting: undefined };
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
  /** Said after a rep that moved past `shallow` but fell short of `down`: 'Go lower', 'Lift your hips higher'. */
  short: string;
  /**
   * A second measure on the same side that must move too: past `down` for the bottom, past `shallow`
   * for a failed rep. It falls when `down` is under `shallow`, else rises. A squat's hips, so bent
   * knees alone (kneeling, a bend) are no rep; a lunge's feet apart, so a squat is no lunge.
   */
  also?: {
    measure: Measure;
    down: number;
    shallow: number;
    /** Back past this before the rep ends at the top: a jack's feet together, whichever lands last. */
    up?: number;
  };
};

/** One frame: the position's reading and the measure on the same side; `also` negated when it rises, NaN unconfigured. */
export type CycleSample<P> = { at: P; value: number; joints: Joints; also: number };

/** The first form cue of the attempt, and the furthest `also`. */
type Attempt = { cue: string | null; also: number };

export type CycleReport = Rep & { depth: number; downMs: number | null; upMs: number | null };

export function cycle<P extends { side: Side }>(
  p: Position<P>,
  m: Measure,
  o: CycleOptions,
): Detector<CycleState<Attempt, CycleReport>, CycleSample<P>> {
  const placed = (s: CycleSample<P>) => p.setup(s.at) === null;
  const good = (s: CycleSample<P>) => placed(s) && p.form(s.at) === null;
  // A rising `also` is mirrored, so the attempt keeps its lowest either way.
  const flip = o.also && o.also.down > o.also.shallow ? -1 : 1;
  const past = (value: number, limit: 'down' | 'shallow') =>
    !o.also || value <= flip * o.also[limit];
  const home = (s: CycleSample<P>) => o.also?.up === undefined || s.also >= flip * o.also.up;
  const counter = engine<CycleSample<P>, Attempt, CycleReport>({
    signal: (s) => s.value,
    range: m.range,
    up: o.up,
    down: o.down,
    shallow: o.shallow,
    // `also.up` ends a rep but doesn't gate the start: people wait with their feet apart (a jack's
    // ready stance reads 0.36–0.48 leg lengths on device, its landings 0.08–0.20).
    start: good,
    // The bottom counts only with good form; setup is not judged mid-movement.
    turn: (s) => p.form(s.at) === null && past(s.also, 'down'),
    // A shallow dip is a failed rep only while still in the position.
    tried: (a, s) => placed(s) && past(a.also, 'shallow'),
    top: home,
    clean: (a, s) => a.cue === null && placed(s),
    rest: (s) => p.setup(s.at) ?? p.form(s.at),
    fresh: { cue: null, also: Infinity },
    add: (a, s) => ({ cue: a.cue ?? p.form(s.at), also: Math.min(a.also, s.also) }),
    report: (a, s, r) => {
      const { counted, downMs, upMs } = r;
      const fast = downMs !== null && upMs !== null && downMs + upMs < o.fastMs;
      const cue = !counted && (p.setup(s.at) ?? a.cue ?? o.short);
      const cues = [cue, fast && 'Slow down'].filter((x): x is string => !!x);
      return { ...r, cues };
    },
  });
  const on = (pose: Pose, at: P, side: Side) => {
    const reading = m.read(pose, side);
    const also = o.also ? o.also.measure.read(pose, side) : { value: NaN };
    return reading && also ? { at, ...reading, also: flip * also.value } : null;
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
