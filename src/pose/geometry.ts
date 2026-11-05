// Joint geometry shared by every exercise counter (MediaPipe Pose Landmarker: 33 joints, MediaPipe order).

export type Point = { x: number; y: number; z: number; visibility: number };
/** `image`: 0..1 frame coords (to check the joint is really in view). `world`: metres (for angles). */
export type Pose = { image: Point[]; world: Point[] };

const MIN_VISIBILITY = 0.5;

/** Angle at `b` between `a` and `c`, in 3D. Degrees; NaN for coincident joints. */
export function angle(a: Point, b: Point, c: Point): number {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const cos = dot / (Math.hypot(...v1) * Math.hypot(...v2));
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

// Joints outside the frame are extrapolated by the model; don't trust them.
export const inFrame = (p: Point | undefined) =>
  !!p && p.visibility >= MIN_VISIBILITY && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1;
