// Joint geometry shared by every exercise counter (MediaPipe Pose Landmarker: 33 joints, MediaPipe order).
import type { PoseDetection, PoseLandmark } from 'superhabit-pose';
import { Joint } from 'superhabit-pose/joints';

/**
 * One frame's joints, as the detector gives them: `landmarks` in 0..1 frame coords (to check a
 * joint is really in view), `worldLandmarks` in metres (for angles). Index both with `Joint`.
 */
export type Pose = Pick<PoseDetection, 'landmarks' | 'worldLandmarks'>;

/** MediaPipe indices [a, vertex, c] of a measured angle. */
export type Joints = readonly [number, number, number];

const MIN_VISIBILITY = 0.5;

/** Angle at `b` between `a` and `c`, in 3D. Degrees; NaN for coincident joints. */
export function angle(a: PoseLandmark, b: PoseLandmark, c: PoseLandmark): number {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const cos = dot / (Math.hypot(...v1) * Math.hypot(...v2));
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

// Joints outside the frame are extrapolated by the model; don't trust them.
export const inFrameWithVisibility = (p: PoseLandmark | undefined, minVisibility: number) =>
  !!p && p.visibility >= minVisibility && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1;

export const inFrame = (p: PoseLandmark | undefined) => inFrameWithVisibility(p, MIN_VISIBILITY);

export type BodyPart = 'head' | 'hands' | 'hips' | 'feet';

// Either side will do: side-on, the far limbs hide behind the body.
const PART_JOINTS: Record<BodyPart, readonly number[]> = {
  head: [Joint.NOSE, Joint.LEFT_SHOULDER, Joint.RIGHT_SHOULDER],
  hands: [Joint.LEFT_WRIST, Joint.RIGHT_WRIST],
  hips: [Joint.LEFT_HIP, Joint.RIGHT_HIP],
  feet: [Joint.LEFT_ANKLE, Joint.RIGHT_ANKLE],
};

/** The `parts` with none of their joints in frame, in `parts` order. */
export const outOfFrame = (landmarks: Pose['landmarks'], parts: readonly BodyPart[]) =>
  parts.filter((part) => !PART_JOINTS[part].some((i) => inFrame(landmarks[i])));
