// Squat rep counter on MediaPipe Pose Landmarker output (33 joints, MediaPipe order).
import type { PoseLandmark } from 'superhabit-pose';
import { Joint } from 'superhabit-pose/joints';

import { angle, inFrame, type Joints, type Pose } from './geometry';
import { cycle, type CycleState } from './cycle';
import { fmtMs, type Exercise } from './exercise';

const MAX_ASYMMETRY = 35; // degrees between left and right knee
const LEGS = [
  [Joint.LEFT_HIP, Joint.LEFT_KNEE, Joint.LEFT_ANKLE],
  [Joint.RIGHT_HIP, Joint.RIGHT_KNEE, Joint.RIGHT_ANKLE],
] as const;

export const DOWN = 100; // knee angle at or below this = deep enough
export const UP = 160; // back to standing
const SHALLOW = 140; // went this low without reaching DOWN = no-rep

/** [left, right] 3D knee angles, or null unless both legs are fully in frame and agree. */
function legAngles({ landmarks: image, worldLandmarks: world }: Pose): [number, number] | null {
  const out: number[] = [];
  for (const [h, k, a] of LEGS) {
    if (![image[h], image[k], image[a]].every(inFrame)) return null;
    if (!world[h] || !world[k] || !world[a]) return null;
    const deg = angle(world[h], world[k], world[a]);
    // Coincident joints or invalid coordinates have no angle; don't poison the rep's minimum.
    if (!Number.isFinite(deg)) return null;
    out.push(deg);
  }
  // Squats are symmetric (real reps differ by <20°); a big gap is a mis-tracked leg or a one-leg move.
  if (Math.abs(out[0] - out[1]) > MAX_ASYMMETRY) return null;
  return [out[0], out[1]];
}

const mid = (a: PoseLandmark, b: PoseLandmark) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
});
const dist = (a: PoseLandmark | ReturnType<typeof mid>, b: PoseLandmark | ReturnType<typeof mid>) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** One frame's measurements; `hip` and `lean` come from world landmarks (metres, y down). */
export type Sample = {
  legs: [number, number];
  /** Vertical knee-below-hip gap / thigh length: ~1 standing, ~0 thighs parallel. */
  hip: number;
  /** Shoulder-mid to hip-mid vs vertical, degrees. */
  lean: number;
  /** Knee width / ankle width when facing the camera, null when side-on. */
  valgus: number | null;
  /** [hip, knee, ankle] of the better-seen leg, for drawing. */
  joints: Joints;
};

export function measure(pose: Pose): Sample | null {
  const legs = legAngles(pose);
  if (!legs) return null;
  const w = pose.worldLandmarks;
  const visible = (leg: Joints) => Math.min(...leg.map((i) => pose.landmarks[i].visibility));
  const hips = mid(w[Joint.LEFT_HIP], w[Joint.RIGHT_HIP]);
  const knees = mid(w[Joint.LEFT_KNEE], w[Joint.RIGHT_KNEE]);
  // Thigh-relative hip drop is scale-free and, in 3D, the same seen from the front or the side;
  // a shoulder–ankle ratio would also move with torso lean.
  const thigh =
    (dist(w[Joint.LEFT_HIP], w[Joint.LEFT_KNEE]) + dist(w[Joint.RIGHT_HIP], w[Joint.RIGHT_KNEE])) /
    2;
  // Off-frame shoulders are guesses; without them lean reads 0 (hips == shoulders).
  const seen = [Joint.LEFT_SHOULDER, Joint.RIGHT_SHOULDER].every((i) => inFrame(pose.landmarks[i]));
  const shoulders =
    seen && w[Joint.LEFT_SHOULDER] && w[Joint.RIGHT_SHOULDER]
      ? mid(w[Joint.LEFT_SHOULDER], w[Joint.RIGHT_SHOULDER])
      : hips;
  const lean = (Math.acos((hips.y - shoulders.y) / dist(hips, shoulders)) * 180) / Math.PI;
  // Hips spread along x more than depth means the body faces the camera.
  const front =
    Math.abs(w[Joint.RIGHT_HIP].x - w[Joint.LEFT_HIP].x) >
    Math.abs(w[Joint.RIGHT_HIP].z - w[Joint.LEFT_HIP].z);
  return {
    legs,
    hip: (knees.y - hips.y) / thigh,
    lean: Number.isFinite(lean) ? lean : 0,
    valgus: front
      ? Math.abs(w[Joint.RIGHT_KNEE].x - w[Joint.LEFT_KNEE].x) /
        Math.abs(w[Joint.RIGHT_ANKLE].x - w[Joint.LEFT_ANKLE].x)
      : null,
    joints: visible(LEGS[1]) > visible(LEGS[0]) ? LEGS[1] : LEGS[0],
  };
}

const HIP_BOTTOM = 0.7; // hip ratio at or below this = the hips really dropped (thigh ≥ ~45° from vertical)
// A shallow attempt only counts as a no-rep once the hips started to drop (thigh ≥ ~18°), so kneeling
// or bending to the phone stays silent. A real 140° half squat reads ~0.92; tune on device.
const HIP_STARTED = 0.95;
// Starting values from FormCheck / LearnOpenCV / SquatCoachAI write-ups; tune on device.
const CUE_SYMMETRY = 10; // deg mean |L−R|
const CUE_FAST_MS = 800; // full rep
const CUE_LEAN = 45; // deg
const CUE_VALGUS = 0.8; // knee width / ankle width

type RepReport = {
  counted: boolean;
  depth: number; // min smoothed knee angle
  symmetry: number; // mean |L−R| knee angle over the attempt, deg
  downMs: number | null;
  upMs: number | null;
  lean: number; // max trunk lean, deg
  valgus: number | null; // min knee/ankle width ratio, null when never front-facing
  cues: string[];
};

type Attempt = {
  hip: number; // lowest hip ratio
  sym: number;
  n: number;
  lean: number;
  valgus: number | null;
};

/** Tracks the knee angle of the straighter leg. */
export type SquatState = CycleState<Attempt, RepReport>;

const squatCycle = cycle<Sample, Attempt, RepReport>({
  signal: (m) => Math.max(...m.legs),
  up: UP,
  down: DOWN,
  shallow: SHALLOW,
  turn: (m) => m.hip <= HIP_BOTTOM,
  tried: (a) => a.hip <= HIP_STARTED,
  fresh: { hip: Infinity, sym: 0, n: 0, lean: 0, valgus: null },
  add: (a, m) => ({
    hip: Math.min(a.hip, m.hip),
    sym: a.sym + Math.abs(m.legs[0] - m.legs[1]),
    n: a.n + 1,
    lean: Math.max(a.lean, m.lean),
    valgus:
      m.valgus === null || !Number.isFinite(m.valgus)
        ? a.valgus
        : Math.min(a.valgus ?? Infinity, m.valgus),
  }),
  report: (a, _m, { counted, depth, downMs, upMs }) => {
    const fast = downMs !== null && upMs !== null && downMs + upMs < CUE_FAST_MS;
    const symmetry = a.n ? a.sym / a.n : 0;
    const cues = [
      !counted && 'Go deeper',
      symmetry > CUE_SYMMETRY && 'Even out your legs',
      a.lean > CUE_LEAN && 'Chest up',
      a.valgus !== null && a.valgus < CUE_VALGUS && 'Knees out',
      fast && 'Slow down',
    ].filter((c): c is string => !!c);
    return { counted, depth, symmetry, downMs, upMs, lean: a.lean, valgus: a.valgus, cues };
  },
});

export const squat: Exercise<SquatState, Sample> = {
  ...squatCycle,
  name: 'squats',
  glyph:
    'M13.4 6a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M15 9l-3 8M12 17l9 1M21 18l-1 8M14 11.5l10 .5M6 26h20',
  placement: 'front-upright',
  place: 'Stand the phone upright',
  steps: ['Prop it up on its short edge', '2 to 3 m away, facing you', 'Head to feet in frame'],
  hint: 'Counting starts once you stand tall.',
  ready: 'Stand tall',
  parts: ['head', 'hips', 'feet'],
  gauge: { down: DOWN, up: UP },
  measure,
  stats: ({ lastRep: r }) =>
    r &&
    `${Math.round(r.depth)}° · SYM ${Math.round(r.symmetry)}° · ${fmtMs(r.downMs)}↓ ${fmtMs(r.upMs)}↑ · LEAN ${Math.round(r.lean)}°`,
};

export const initialSquat = squat.initial;
export function stepSquat(s: SquatState, sample: Sample | null, nowMs: number): SquatState {
  return squat.step(s, sample, nowMs);
}
