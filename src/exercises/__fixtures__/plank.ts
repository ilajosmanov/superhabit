// Synthetic side-on push-up poses for tests.
import type { PoseLandmark } from 'superhabit-pose';
import { Joint } from 'superhabit-pose/joints';

import type { Pose } from '../geometry';

type Plank = {
  /** Elbow angle, deg: 180 = arms straight. Standing: the forearm curls forward. */
  elbow?: number;
  /** Shoulder–hip–ankle bend, deg: the body line reads 180 − sag. */
  sag?: number;
  /** Knees and shins on the floor (a knee push-up) instead of on the toes. */
  kneeling?: boolean;
  /** Upright with arms hanging instead of a plank. */
  standing?: boolean;
  /** The side the camera sees; the other side has visibility 0.1, like an occluded far arm. */
  visible?: 'left' | 'right' | 'both';
};

const UPPER_ARM = 0.3;
const FOREARM = 0.28;

/**
 * World landmarks in metres, y down, the body in the x–y plane (side-on to the camera),
 * far side 0.36 m deeper. Plank: ankle at the origin, wrists on the floor under the shoulders,
 * elbows bending back toward the feet. Image points are inside the frame.
 */
export const plank = ({
  elbow = 175,
  sag = 0,
  standing = false,
  kneeling = false,
  visible = 'left',
}: Plank): Pose => {
  const rad = Math.PI / 180;
  let shoulder: [number, number];
  let el: [number, number];
  let wrist: [number, number];
  let hip: [number, number];
  let ankle: [number, number] = [0, 0];
  let knee: [number, number] | undefined;
  if (standing) {
    shoulder = [0, -1.45];
    hip = [0, -0.9];
    el = [0, shoulder[1] + UPPER_ARM];
    const t = (180 - elbow) * rad; // forearm tilt forward from hanging
    wrist = [el[0] + FOREARM * Math.sin(t), el[1] + FOREARM * Math.cos(t)];
  } else {
    wrist = [1.4, 0];
    const d = Math.sqrt(
      UPPER_ARM ** 2 + FOREARM ** 2 - 2 * UPPER_ARM * FOREARM * Math.cos(elbow * rad),
    );
    shoulder = [wrist[0], -d];
    // Angle at the shoulder between straight down (to the wrist) and the upper arm.
    const a = Math.acos(
      Math.min(1, (UPPER_ARM ** 2 + d ** 2 - FOREARM ** 2) / (2 * UPPER_ARM * d)),
    );
    el = [shoulder[0] - UPPER_ARM * Math.sin(a), shoulder[1] + UPPER_ARM * Math.cos(a)];
    // Isosceles: the hip drops off the shoulder–ankle midpoint so the hip angle is 180 − sag.
    const [mx, my] = [(shoulder[0] + ankle[0]) / 2, (shoulder[1] + ankle[1]) / 2];
    const half = Math.hypot(shoulder[0] - ankle[0], shoulder[1] - ankle[1]) / 2;
    const h = half * Math.tan((sag / 2) * rad);
    const [ux, uy] = [(shoulder[0] - ankle[0]) / (2 * half), (shoulder[1] - ankle[1]) / (2 * half)];
    hip = [mx - uy * h, my + ux * h]; // perpendicular, toward the floor (+y)
    if (kneeling) {
      knee = [0.55, 0];
      hip = [(shoulder[0] + knee[0]) / 2, (shoulder[1] + knee[1]) / 2];
      ankle = [0.1, 0];
    }
  }

  const world = Array.from({ length: 33 }, (): PoseLandmark => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0.9,
  }));
  const image = world.map((): PoseLandmark => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
  // Straight legs: the knee sits halfway between hip and ankle.
  knee ??= [(hip[0] + ankle[0]) / 2, (hip[1] + ankle[1]) / 2];
  const joints = [shoulder, el, wrist, hip, knee, ankle];
  const sides = [
    {
      ids: [
        Joint.LEFT_SHOULDER,
        Joint.LEFT_ELBOW,
        Joint.LEFT_WRIST,
        Joint.LEFT_HIP,
        Joint.LEFT_KNEE,
        Joint.LEFT_ANKLE,
      ],
      z: 0,
      seen: visible !== 'right',
    },
    {
      ids: [
        Joint.RIGHT_SHOULDER,
        Joint.RIGHT_ELBOW,
        Joint.RIGHT_WRIST,
        Joint.RIGHT_HIP,
        Joint.RIGHT_KNEE,
        Joint.RIGHT_ANKLE,
      ],
      z: -0.36,
      seen: visible !== 'left',
    },
  ];
  for (const { ids, z, seen } of sides)
    ids.forEach((i, j) => {
      const [x, y] = joints[j];
      const visibility = seen ? 0.9 : 0.1;
      world[i] = { x, y, z, visibility };
      image[i] = { x: 0.2 + x * 0.5, y: 0.8 + y * 0.4, z: 0, visibility };
    });
  return { landmarks: image, worldLandmarks: world };
};
