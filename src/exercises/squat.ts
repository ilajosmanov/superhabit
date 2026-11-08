// Squat rep counter on MediaPipe Pose Landmarker output (33 joints, MediaPipe order).
import { Joint, SIDE } from 'superhabit-pose/joints';

import {
  angle,
  bestSide,
  distance,
  mid,
  seen,
  sub,
  tilt,
  type Joints,
  type Pose,
} from './geometry';
import { cycle, type CycleState } from './cycle';
import { fmtMs, SETUP, type Exercise } from './exercise';

const MAX_ASYMMETRY = 35; // degrees between left and right knee
const LEGS = [SIDE.left, SIDE.right].map(({ hip, knee, ankle }): Joints => [hip, knee, ankle]);

const SQUAT_DOWN = 100; // knee angle at or below this = deep enough
const SQUAT_UP = 160; // back to standing
const SHALLOW = 140; // went this low without reaching SQUAT_DOWN = no-rep

/** [left, right] 3D knee angles, or null unless both legs are fully in frame and agree. */
function legAngles(pose: Pose): [number, number] | null {
  const world = pose.worldLandmarks;
  const out: number[] = [];
  for (const [h, k, a] of LEGS) {
    if (![h, k, a].every((i) => seen(pose, i))) return null;
    const deg = angle(world[h], world[k], world[a]);
    // Coincident joints or invalid coordinates have no angle; don't poison the rep's minimum.
    if (!Number.isFinite(deg)) return null;
    out.push(deg);
  }
  // Squats are symmetric (real reps differ by <20°); a big gap is a mis-tracked leg or a one-leg move.
  if (Math.abs(out[0] - out[1]) > MAX_ASYMMETRY) return null;
  return [out[0], out[1]];
}

/** One frame's measurements; `hip` and `lean` come from world landmarks (metres, y down). */
export type SquatSample = {
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

export function measureSquat(pose: Pose): SquatSample | null {
  const legs = legAngles(pose);
  if (!legs) return null;
  const w = pose.worldLandmarks;
  const visible = (leg: Joints) => Math.min(...leg.map((i) => pose.landmarks[i].visibility));
  const hips = mid(w[Joint.LEFT_HIP], w[Joint.RIGHT_HIP]);
  const knees = mid(w[Joint.LEFT_KNEE], w[Joint.RIGHT_KNEE]);
  // Thigh-relative hip drop is scale-free and, in 3D, the same seen from the front or the side;
  // a shoulder–ankle ratio would also move with torso lean.
  const thigh =
    (distance(w[Joint.LEFT_HIP], w[Joint.LEFT_KNEE]) +
      distance(w[Joint.RIGHT_HIP], w[Joint.RIGHT_KNEE])) /
    2;
  // Off-frame shoulders are guesses; without them lean reads 0.
  const lean = [Joint.LEFT_SHOULDER, Joint.RIGHT_SHOULDER].every((i) => seen(pose, i))
    ? tilt(sub(hips, mid(w[Joint.LEFT_SHOULDER], w[Joint.RIGHT_SHOULDER])))
    : 0;
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

const squatCycle = cycle<SquatSample, Attempt, RepReport>({
  signal: (m) => Math.max(...m.legs),
  up: SQUAT_UP,
  down: SQUAT_DOWN,
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

export const squat: Exercise<SquatState, SquatSample> = {
  ...squatCycle,
  name: 'squats',
  placement: 'front-upright',
  ...SETUP['front-upright'],
  hint: 'Counting starts once you stand tall.',
  ready: 'Stand tall',
  parts: ['head', 'hips', 'feet'],
  gauge: { down: SQUAT_DOWN, up: SQUAT_UP },
  measure: measureSquat,
  stats: ({ lastRep: r }) =>
    r &&
    `${Math.round(r.depth)}° · SYM ${Math.round(r.symmetry)}° · ${fmtMs(r.downMs)}↓ ${fmtMs(r.upMs)}↑ · LEAN ${Math.round(r.lean)}°`,
};

/**
 * Side-on the far leg often hides: with both legs seen this is `measureSquat` (so a lunge's uneven legs
 * still read null); otherwise the near leg stands in for both, and the symmetry cue stays quiet.
 */
export function measureSideSquat(pose: Pose): SquatSample | null {
  if (LEGS.every((leg) => leg.every((i) => seen(pose, i)))) return measureSquat(pose);
  const side = bestSide(pose, (j) => [j.hip, j.knee, j.ankle]);
  if (!side) return null;
  const { shoulder: s, hip: h, knee: k, ankle: a } = SIDE[side];
  const w = pose.worldLandmarks;
  const knee = angle(w[h], w[k], w[a]);
  const hip = (w[k].y - w[h].y) / distance(w[h], w[k]);
  if (!Number.isFinite(knee) || !Number.isFinite(hip)) return null;
  const lean = seen(pose, s) ? tilt(sub(w[h], w[s])) : 0;
  return {
    legs: [knee, knee],
    hip,
    lean: Number.isFinite(lean) ? lean : 0,
    valgus: null,
    joints: [h, k, a],
  };
}

// shortcut: squat's thresholds, tuned front-on, and side-on lunges count as squats (up to 20 on a device
// lunge clip; the far leg is too rough to tell them apart). Record side-on squat clips and retune.
/** The same squat, counted with the phone side-on, so it joins lunges without moving the phone. */
export const sideSquat: Exercise<SquatState, SquatSample> = {
  ...squat,
  placement: 'side-upright',
  ...SETUP['side-upright'],
  measure: measureSideSquat,
  stats: ({ lastRep: r }) =>
    r &&
    `${Math.round(r.depth)}° · ${fmtMs(r.downMs)}↓ ${fmtMs(r.upMs)}↑ · LEAN ${Math.round(r.lean)}°`,
};
