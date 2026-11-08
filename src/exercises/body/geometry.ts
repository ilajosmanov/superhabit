// Joint geometry shared by every exercise counter (MediaPipe Pose Landmarker: 33 joints, MediaPipe order).
import type { PoseDetection, PoseLandmark } from 'superhabit-pose';
import { Joint, SIDE } from 'superhabit-pose/joints';

/**
 * One frame's joints, as the detector gives them: `landmarks` in 0..1 frame coords (to check a
 * joint is really in view), `worldLandmarks` in metres (for angles). Index both with `Joint`.
 * `down` is gravity in the world axes, when the phone gave it; recorded clips mostly lack it.
 */
export type Pose = Pick<PoseDetection, 'landmarks' | 'worldLandmarks' | 'down'>;

/** MediaPipe indices [a, vertex, c] of a measured angle. */
export type Joints = readonly [number, number, number];

/** A straight joint or body line, in degrees. */
export const STRAIGHT = 180;

/** Joints seen below this visibility are guesses; exercises with occluded limbs lower it. */
export const MIN_VISIBILITY = 0.5;

// World landmarks: metres, y down, origin at the hips.
export type Vec = { x: number; y: number; z: number };
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale = (v: Vec, k: number): Vec => ({ x: v.x * k, y: v.y * k, z: v.z * k });
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
export const length = (v: Vec) => Math.hypot(v.x, v.y, v.z);
export const distance = (a: Vec, b: Vec) => length(sub(a, b));
export const mid = (a: Vec, b: Vec) => scale(add(a, b), 1 / 2);
/** `v` with its component along `along` removed; NaN for a zero `along`. */
export const reject = (v: Vec, along: Vec) =>
  sub(v, scale(along, dot(v, along) / length(along) ** 2));
export const degrees = (radians: number) => (radians * STRAIGHT) / Math.PI;

/** Angle between two vectors, 0..180 degrees; NaN for a zero vector. */
export const between = (u: Vec, v: Vec) =>
  degrees(Math.acos(Math.min(1, Math.max(-1, dot(u, v) / (length(u) * length(v))))));

/** Angle at `b` between `a` and `c`, in 3D. Degrees; NaN for coincident joints. */
export const angle = (a: Vec, b: Vec, c: Vec) => between(sub(a, b), sub(c, b));

const DOWN: Vec = { x: 0, y: 1, z: 0 };
/** How far a downward vector (a hip minus a shoulder) tilts from vertical, degrees. */
export const tilt = (v: Vec) => between(v, DOWN);

/** The phone's gravity, unit length, or null when it gave none or a broken one. */
export const gravity = ({ down }: Pose): Vec | null =>
  down && [down.x, down.y, down.z].every(Number.isFinite) && Math.abs(length(down) - 1) < 0.01
    ? down
    : null;

/** How far the line `from`→`to` rises from level by the phone's gravity, 0..90 degrees; null without it. */
export const rise = (pose: Pose, from: Vec, to: Vec) => {
  const down = gravity(pose);
  return down ? Math.abs(90 - between(sub(to, from), down)) : null;
};

// Joints outside the frame are extrapolated by the model; don't trust them.
export const inFrameWithVisibility = (p: PoseLandmark | undefined, minVisibility: number) =>
  !!p && p.visibility >= minVisibility && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1;

export const inFrame = (p: PoseLandmark | undefined) => inFrameWithVisibility(p, MIN_VISIBILITY);

/** Joint `i` is in frame, visible enough and has a world position. */
export const seen = (pose: Pose, i: number, minVisibility = MIN_VISIBILITY) =>
  inFrameWithVisibility(pose.landmarks[i], minVisibility) && !!pose.worldLandmarks[i];

export type Side = keyof typeof SIDE;
export type SideJoints = (typeof SIDE)[Side];

/**
 * The side whose `pick`ed joints are all seen, preferring the higher lowest visibility (left on
 * a tie); null when neither side is complete. Side-on, the far limbs hide.
 */
export function bestSide(
  pose: Pose,
  pick: (side: SideJoints) => readonly number[],
  minVisibility = MIN_VISIBILITY,
): Side | null {
  const visibility = (side: Side) => {
    const joints = pick(SIDE[side]);
    return joints.every((i) => seen(pose, i, minVisibility))
      ? Math.min(...joints.map((i) => pose.landmarks[i].visibility))
      : null;
  };
  const left = visibility('left');
  const right = visibility('right');
  if (right === null) return left === null ? null : 'left';
  return left === null || right > left ? 'right' : 'left';
}

/** In the order the framing checklist names them. */
export const BODY_PARTS = ['head', 'hands', 'hips', 'feet'] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

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
