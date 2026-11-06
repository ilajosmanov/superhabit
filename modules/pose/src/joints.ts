// Plain data, no native imports, so Node tests can load it (the package entry pulls in Nitro).

/** MediaPipe Pose Landmarker's 33 joints: indices into `landmarks` and `worldLandmarks`. */
export const Joint = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

/** Each side's limb joints by name, for code that picks the better-seen side. */
export const SIDE = {
  left: {
    shoulder: Joint.LEFT_SHOULDER,
    elbow: Joint.LEFT_ELBOW,
    wrist: Joint.LEFT_WRIST,
    hip: Joint.LEFT_HIP,
    knee: Joint.LEFT_KNEE,
    ankle: Joint.LEFT_ANKLE,
  },
  right: {
    shoulder: Joint.RIGHT_SHOULDER,
    elbow: Joint.RIGHT_ELBOW,
    wrist: Joint.RIGHT_WRIST,
    hip: Joint.RIGHT_HIP,
    knee: Joint.RIGHT_KNEE,
    ankle: Joint.RIGHT_ANKLE,
  },
} as const;
