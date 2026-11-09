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

/**
 * Both limbs moving alike (a squat's knees). With both seen it reads the `higher` value (by default)
 * or the `lower`: a squat reads its straighter knee, so both must bend; a jack its lower arm, so both
 * must rise; a lunge its more bent knee, the front one. Nothing when they differ by more than `gap`:
 * one limb moving alone (a kick) is not the exercise. With one seen, that one stands in, as side-on
 * where the far limb hides. The same limb is read at the top, so the other may stop up to `gap` short
 * of it there.
 */
export const bothSides = (
  m: Measure,
  gap: number,
  read: 'higher' | 'lower' = 'higher',
): Measure => ({
  ...m,
  read: (pose, side) => {
    const own = m.read(pose, side);
    const other = m.read(pose, side === 'left' ? 'right' : 'left');
    if (!own || !other) return own;
    if (Math.abs(own.value - other.value) > gap) return null;
    return { ...own, value: (read === 'lower' ? Math.min : Math.max)(own.value, other.value) };
  },
});
