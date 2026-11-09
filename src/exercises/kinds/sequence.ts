import { BODY_PARTS, type Joints, type Pose } from '@/exercises/body/geometry';
import type { Position } from '@/exercises/positions/position';
import type { Detector, Progress } from './progress';

type Measured = { joints: Joints };

/** One frame: the position reached (its index), or null between them; each position's form cue. */
export type SequenceSample = { at: number | null; joints: Joints; form: (string | null)[] };

export type SequenceState = Progress & {
  next: number;
  stepAt: number | null;
  lastSeenAt?: number;
  candidate: { at: number; n: number } | null;
  /** Since when the position last reached has had poor form. */
  slipAt: number | null;
};

const TRACKING_TIMEOUT_MS = 1000;
// Device burpees: jumping the feet in pikes the plank for at most 0.2 s; letting the hips sink to the
// floor after it held poor form for 1.3–2.8 s.
const SLIP_MS = 500;

/** The position's sample when it reads: whether the body is in it (setup and form pass), its form cue. */
function reach<P extends Measured>(p: Position<P>, pose: Pose) {
  const m = p.read(pose);
  if (!m) return null;
  const form = p.form(m);
  return { joints: m.joints, in: p.setup(m) === null && form === null, form };
}

/**
 * Positions reached in order, each confirmed on two consecutive frames; returning to the first after
 * the last counts a rep. Form counts too: on device burpees, a pike with the hands down passed as a
 * plank, and a straight line passed on the way down to the floor did too. So the position reached must
 * keep its form until the next: poor form past `SLIP_MS` fails the rep with the form cue. A position
 * not reached within `maxStepMs` fails it with that position's `ready` cue.
 */
export function sequence<T extends readonly [Measured, Measured, ...Measured[]]>(
  positions: { readonly [K in keyof T]: Position<T[K]> },
  { maxStepMs }: { maxStepMs: number },
): Detector<SequenceState, SequenceSample> {
  const count = positions.length;
  const initial: SequenceState = {
    reps: 0,
    noReps: 0,
    heldMs: 0,
    phase: 'waiting',
    broken: false,
    lastRep: null,
    next: 0,
    stepAt: null,
    candidate: null,
    slipAt: null,
  };

  function reset(s: SequenceState): SequenceState {
    return {
      ...s,
      phase: 'waiting',
      broken: false,
      next: 0,
      stepAt: null,
      lastSeenAt: undefined,
      candidate: null,
      slipAt: null,
    };
  }

  function fail(s: SequenceState, cue = positions[s.next].ready): SequenceState {
    return {
      ...reset(s),
      lastSeenAt: s.lastSeenAt,
      noReps: s.noReps + 1,
      lastRep: { counted: false, cues: [cue], depth: null, upMs: null },
    };
  }

  function step(s: SequenceState, sample: SequenceSample | null, nowMs: number): SequenceState {
    if (s.lastSeenAt !== undefined && nowMs <= s.lastSeenAt) return s;
    // Expire before checking the step deadline: unseen time is not a failed attempt.
    if (s.lastSeenAt !== undefined && nowMs - s.lastSeenAt > TRACKING_TIMEOUT_MS) {
      s = reset(s);
    }
    if (sample === null) return { ...s, candidate: null };
    s = { ...s, lastSeenAt: nowMs };

    const { at } = sample;
    if (s.phase !== 'waiting' && s.stepAt !== null && nowMs - s.stepAt > maxStepMs) {
      return fail(s);
    }
    if (s.phase !== 'waiting') {
      const cue = sample.form[(s.next + count - 1) % count];
      const slipAt = cue ? (s.slipAt ?? nowMs) : null;
      if (cue && slipAt !== null && nowMs - slipAt > SLIP_MS) return fail(s, cue);
      s = { ...s, slipAt };
    }
    // Holding the start is idle, but returning to it cannot erase an overdue transition.
    if (s.phase === 'up' && at === 0) s = { ...s, stepAt: nowMs };

    if (at === null) return { ...s, candidate: null };
    const candidate = { at, n: s.candidate?.at === at ? Math.min(s.candidate.n + 1, 2) : 1 };
    s = { ...s, candidate };
    if (candidate.n < 2) return s;

    if (s.phase === 'waiting') {
      return at === 0 ? { ...s, phase: 'up', next: 1, stepAt: nowMs } : s;
    }

    const previous = (s.next + count - 1) % count;
    if (at === previous) return s;
    if (at !== s.next) return fail(s);

    if (s.next === 0) {
      return {
        ...s,
        phase: 'up',
        next: 1,
        stepAt: nowMs,
        slipAt: null,
        reps: s.reps + 1,
        lastRep: { counted: true, cues: [], depth: null, upMs: null },
      };
    }
    return { ...s, phase: 'active', next: (s.next + 1) % count, stepAt: nowMs, slipAt: null };
  }

  return {
    kind: 'sequence',
    initial,
    step,
    reset,
    live: () => ({ signal: null, lowest: null }),
    // Null when no position reads: tracking is lost, not a step between them.
    measure: (pose) => {
      const reads = positions.map((p) => reach(p, pose));
      const at = reads.findIndex((r) => r?.in);
      const r = reads[at] ?? reads.find(Boolean);
      const form = reads.map((read) => read?.form ?? null);
      return r ? { at: at < 0 ? null : at, joints: r.joints, form } : null;
    },
    ready: positions[0].ready,
    parts: BODY_PARTS.filter((part) => positions.some((p) => p.parts.includes(part))),
    gauge: null,
    stats: ({ lastRep }) => lastRep && (lastRep.counted ? 'FULL REP' : 'MISSED'),
  };
}
