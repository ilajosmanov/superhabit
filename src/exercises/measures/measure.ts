import type { Joints, Pose, Side } from '@/exercises/body/geometry';

/** One frame's reading: the number a kind counts on, and the joints to draw it with. */
export type Reading = { value: number; joints: Joints };

/**
 * What moves in an exercise, read on one side. The exercise picks the side, because its position
 * needs joints seen too.
 */
export type Measure = {
  /** The joints it reads on a side, so the exercise can pick a side where all of them are seen. */
  joints: (side: Side) => Joints;
  /** Null when one of its joints is not seen or the value is not finite. Pure. */
  read: (pose: Pose, side: Side) => Reading | null;
};
