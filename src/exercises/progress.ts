export type Kind = 'cycle' | 'sided' | 'hold' | 'sequence';
/** 'waiting' = start position not seen since starting, pausing or losing tracking; nothing counts. */
export type Phase = 'waiting' | 'up' | 'down' | 'active';

/** The last attempt. Exercises extend it with their own metrics. */
export type Rep = {
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
