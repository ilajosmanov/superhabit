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
  /**
   * Are you in the position at all? Null, or the cue to get into it. Judged at rest only: through
   * a hold, and at the top of a rep, since a movement passes through shapes that fail it (arms
   * tuck in at the bottom of a push-up).
   */
  setup: (m: M) => string | null;
  /** Is the form good? Null, or the cue. Holds through the whole movement too. */
  form: (m: M) => string | null;
};

/** Setup first: a body out of the position has no form to judge. */
export function fit<M>(p: Pick<Position<M>, 'setup' | 'form'>, m: M): Fit {
  const setup = p.setup(m);
  if (setup) return { cue: setup, out: true };
  const form = p.form(m);
  return form ? { cue: form, out: false } : null;
}
