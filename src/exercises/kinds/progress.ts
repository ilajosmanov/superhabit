import type { BodyPart, Pose } from '@/exercises/body/geometry';
import type { Gauge } from '@/lib/depth';

export type Kind = 'cycle' | 'hold' | 'sequence';
/** 'waiting' = start position not seen since starting, pausing or losing tracking; nothing counts. */
export type Phase = 'waiting' | 'up' | 'down' | 'active';

/** The last attempt or hold break report. Exercises extend it with their own metrics. */
export type Rep = {
  /** Last raw top/idle frame on the detector clock; null for hold breaks. */
  startMs: number | null;
  /** Deepest confirmation frame (lags ~1 frame + smoothing); null for kinds without a bottom. */
  bottomMs: number | null;
  /** End confirmation frame (lags ~1 frame + smoothing); null for hold breaks. */
  endMs: number | null;
  counted: boolean;
  cues: string[];
  /** Extreme of the watched signal over the attempt; null for hold / sequence. */
  depth: number | null;
  /** From the attempt's turn to its end; null when unknown or not a cycle. */
  upMs: number | null;
};

/** What every kind reports to the runner. Each kind's state is a superset. */
export type Progress = {
  reps: number;
  noReps: number;
  heldMs: number;
  phase: Phase;
  /** Hold only: a break past the grace since the last entry or reset. */
  broken: boolean;
  lastRep: Rep | null;
};

/** A kind filled in with an exercise's rules. Pure; never mutates `s`. */
export type Counter<S extends Progress, M> = {
  kind: Kind;
  initial: S;
  step(s: S, sample: M | null, nowMs: number): S;
  /** Drop the attempt, return to waiting and clear broken; keep reps, noReps and heldMs. */
  reset(s: S): S;
  /** Per-frame overlay readout; never goes into React state. */
  live(s: S): { signal: number | null; lowest: number | null };
};

/** A kind filled in with a position (and a measure): everything an exercise needs but its labels. */
export type Detector<S extends Progress, M> = Counter<S, M> & {
  /** The start position, as a short heading while the counter waits for it. */
  ready: string;
  /** Must be in frame to start; the rest may be cut off. */
  parts: readonly BodyPart[];
  /** Null when there is no depth gauge or rep strip (hold / sequence). */
  gauge: Gauge | null;
  /** One detector result's sample; null unless the needed joints are seen. Pure. */
  measure(pose: Pose): M | null;
  /** Metrics line for the last rep, without cues; null before the first rep. */
  stats(s: S): string | null;
};

/** Duration readout for stats lines. */
export const fmtMs = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);
