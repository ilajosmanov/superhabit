import type { SkPoint } from '@shopify/react-native-skia';

import { smooth, type Smooth, type Tuning } from '@/exercises/body/smooth';

/** Per joint: its x and y filters, when this track began and when it was last seen (s); null while unseen. */
export type JointFilter = ({ x: Smooth; y: Smooth; since: number; seen: number } | null)[];

// View points in px at ~15–30 Hz: 1 Hz at rest cuts ±4 px jitter to under 1 px; beta 0.05 opens it
// to ~30 Hz at 600 px/s, so a squat's hips trail by under 10 px and catch up within a few frames.
const PX: Tuning = { minCutoff: 1, beta: 0.05 };
/** A joint missing this long (s) is dropped; shorter dropouts hold the last point instead of blinking. */
const HOLD_S = 0.15;
/**
 * A joint is drawn once its track has lasted this long (s). While the detector searches for a body it
 * reports joints for a frame or two, then nothing: drawn at once, they flash across the screen.
 */
const CONFIRM_S = 0.15;
/** A jump past this share of the view's diagonal in one result is a new track, not a fast move. */
const JUMP = 0.25;

/**
 * Smooths each joint's view point with the 1€ filter; a new track (first seen, back after a dropout,
 * or after a jump) is held back until it has lasted. Pure: returns the next state and the points to draw.
 * `diagonal` is the view's diagonal in the points' units.
 */
export function filterJoints(
  prev: JointFilter | null,
  joints: readonly (SkPoint | null)[],
  tSec: number,
  diagonal: number,
): { state: JointFilter; points: (SkPoint | null)[] } {
  const state = joints.map((p, i): JointFilter[number] => {
    const last = prev?.[i] ?? null;
    if (!p) return last && tSec - last.seen <= HOLD_S ? last : null;
    const jumped = last && Math.hypot(p.x - last.x.x, p.y - last.y.x) > JUMP * diagonal;
    const from = last && !jumped ? last : undefined;
    return {
      x: smooth(from?.x, p.x, tSec, PX),
      y: smooth(from?.y, p.y, tSec, PX),
      since: from?.since ?? tSec,
      seen: tSec,
    };
  });
  const drawn = (j: JointFilter[number]) =>
    j && j.seen - j.since >= CONFIRM_S ? { x: j.x.x, y: j.y.x } : null;
  return { state, points: state.map(drawn) };
}
