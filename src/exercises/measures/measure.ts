import type { BodyPart, Joints, Pose, Side } from '@/exercises/body/geometry';

/** One frame's reading: the number a kind counts on, and the joints to draw it with. */
export type Reading = { value: number; joints: Joints };

/**
 * What moves in an exercise, read on one side. The kind picks the side, because the position
 * needs joints seen there too.
 */
export type Measure = {
  /** Must be in frame, besides the position's parts. */
  parts: readonly BodyPart[];
  /** Every value it can read, low to high; the counter drops anything outside. */
  range: readonly [number, number];
  /** Null when one of its joints is not seen or the value is not finite. Pure. */
  read: (pose: Pose, side: Side) => Reading | null;
};
