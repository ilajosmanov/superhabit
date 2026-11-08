import type { Pose } from '@/exercises/body/geometry';

/**
 * How one frame fits a position. Null: in it, with good form. `out`: not in the position at all
 * (knees down in a plank). Otherwise in the position with its form off (hips sagging): the clock
 * pauses and the cue is said, but the set goes on.
 */
export type Fit = { cue: string; out: boolean } | null;

/** A named body position, measured from one frame and judged. Exercises pick one instead of writing their own. */
export type Position<M> = {
  /** Short heading while the counter waits for it: 'Get into a plank'. */
  ready: string;
  /** Said when tracking is lost mid-set: 'Back into your plank'. */
  lost: string;
  /** Null unless the joints it needs are seen. Pure. */
  measure: (pose: Pose) => M | null;
  fit: (m: M) => Fit;
};
