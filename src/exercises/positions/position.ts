import type { BodyPart, Pose, Side } from '@/exercises/body/geometry';

/** A named body position, read from one frame and judged. Exercises pick one instead of writing their own. */
export type Position<P> = {
  /** Short heading while the counter waits for it: 'Get into a plank'. */
  ready: string;
  /** Said when tracking is lost mid-set: 'Back into your plank'. */
  lost: string;
  /** Must be in frame to start; the rest may be cut off. */
  parts: readonly BodyPart[];
  /** On `side` when given, else the better-seen side. Null unless the joints it needs are seen. Pure. */
  read: (pose: Pose, side?: Side) => P | null;
  /**
   * Are you in the position at all? Null, or the cue to get into it. Judged at rest only: through
   * a hold, and at the top of a rep, since a movement passes through shapes that fail it (arms
   * tuck in at the bottom of a push-up).
   */
  setup: (p: P) => string | null;
  /** Is the form good? Null, or the cue. Holds through the whole movement too. */
  form: (p: P) => string | null;
};
