// Squat rep counter on MediaPipe Pose Landmarker output (33 joints, MediaPipe order).
import { OneEuroFilter } from '1eurofilter';

import { angle, inFrame, type Point, type Pose } from './geometry';

const MAX_ASYMMETRY = 35; // degrees between left and right knee
const LEGS = [
  [23, 25, 27], // left hip, knee, ankle
  [24, 26, 28], // right
] as const;

export const DOWN = 100; // knee angle at or below this = deep enough
export const UP = 160; // back to standing
export const SHALLOW = 140; // went this low without reaching DOWN = no-rep
export const TRACKING_TIMEOUT_MS = 1000; // tolerate brief dropouts, but require standing after losing tracking

/**
 * Knee angle of the straighter leg: a squat bends both knees, so a single-leg
 * move (leg circle, knee raise) never reaches "down". Null unless both legs are seen.
 */
export function kneeAngle(pose: Pose): number | null {
  const legs = legAngles(pose);
  return legs && Math.max(...legs);
}

/** [left, right] 3D knee angles, or null unless both legs are fully in frame and agree. */
export function legAngles({ image, world }: Pose): [number, number] | null {
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

const mid = (a: Point, b: Point) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
});
const dist = (a: Point | ReturnType<typeof mid>, b: Point | ReturnType<typeof mid>) =>
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
};

export function measure(pose: Pose): Sample | null {
  const legs = legAngles(pose);
  if (!legs) return null;
  const w = pose.world;
  const hips = mid(w[23], w[24]);
  const knees = mid(w[25], w[26]);
  // Thigh-relative hip drop is scale-free and, in 3D, the same seen from the front or the side;
  // a shoulder–ankle ratio would also move with torso lean.
  const thigh = (dist(w[23], w[25]) + dist(w[24], w[26])) / 2;
  // Off-frame shoulders are guesses; without them lean reads 0 (hips == shoulders).
  const seen = [11, 12].every((i) => inFrame(pose.image[i]));
  const shoulders = seen && w[11] && w[12] ? mid(w[11], w[12]) : hips;
  const lean = (Math.acos((hips.y - shoulders.y) / dist(hips, shoulders)) * 180) / Math.PI;
  // Hips spread along x more than depth means the body faces the camera.
  const front = Math.abs(w[24].x - w[23].x) > Math.abs(w[24].z - w[23].z);
  return {
    legs,
    hip: (knees.y - hips.y) / thigh,
    lean: Number.isFinite(lean) ? lean : 0,
    valgus: front ? Math.abs(w[26].x - w[25].x) / Math.abs(w[28].x - w[27].x) : null,
  };
}

export const HIP_BOTTOM = 0.7; // hip ratio at or below this = the hips really dropped (thigh ≥ ~45° from vertical)
// A shallow attempt only counts as a no-rep once the hips started to drop (thigh ≥ ~18°), so kneeling
// or bending to the phone stays silent. A real 140° half squat reads ~0.92; tune on device.
export const HIP_STARTED = 0.95;
// Starting values from FormCheck / LearnOpenCV / SquatCoachAI write-ups; tune on device.
const CUE_SYMMETRY = 10; // deg mean |L−R|
const CUE_FAST_MS = 800; // full rep
const CUE_LEAN = 45; // deg
const CUE_VALGUS = 0.8; // knee width / ankle width

export type RepReport = {
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
  startAt?: number;
  bottomAt?: number;
};

export type SquatState = {
  reps: number;
  noReps: number;
  phase: 'waiting' | 'up' | 'down';
  min: number; // lowest held knee angle since last standing
  lastRep: RepReport | null;
  lastSeenAt?: number; // monotonic time of the last valid angle, when supplied by the caller
  // Mutable and stateful: call stepSquat once per sample and never replay an old state.
  filter?: OneEuroFilter;
  prev?: number; // previous smoothed angle, for the two-sample hold
  attempt: Attempt;
};

const fresh = (at?: number): Attempt => ({
  hip: Infinity,
  sym: 0,
  n: 0,
  lean: 0,
  valgus: null,
  startAt: at,
});

export const initialSquat: SquatState = {
  reps: 0,
  noReps: 0,
  phase: 'waiting',
  min: 180,
  lastRep: null,
  attempt: fresh(),
};

function report(a: Attempt, depth: number, counted: boolean, nowMs?: number): RepReport {
  const downMs =
    a.bottomAt !== undefined && a.startAt !== undefined ? a.bottomAt - a.startAt : null;
  const upMs = nowMs !== undefined && a.bottomAt !== undefined ? nowMs - a.bottomAt : null;
  const symmetry = a.n ? a.sym / a.n : 0;
  const cues = [
    !counted && 'Go deeper',
    symmetry > CUE_SYMMETRY && 'Even out your legs',
    a.lean > CUE_LEAN && 'Chest up',
    a.valgus !== null && a.valgus < CUE_VALGUS && 'Knees out',
    downMs !== null && upMs !== null && downMs + upMs < CUE_FAST_MS && 'Slow down',
  ].filter((c): c is string => !!c);
  return { counted, depth, symmetry, downMs, upMs, lean: a.lean, valgus: a.valgus, cues };
}

// Input at detector speed (~15–30 Hz); the filter uses real timestamps. 1 Hz min cutoff + small beta (angle units are degrees, so speeds reach ~200°/s):
// a one-frame spike is cut to under half, while a real 1 s rep loses only a few degrees of depth.
const newFilter = () => new OneEuroFilter(15, 1, 0.01);

export function stepSquat(s: SquatState, sample: Sample | null, nowMs?: number): SquatState {
  if (
    nowMs !== undefined &&
    s.lastSeenAt !== undefined &&
    nowMs - s.lastSeenAt > TRACKING_TIMEOUT_MS &&
    (s.phase !== 'waiting' || s.filter)
  ) {
    s = { ...s, phase: 'waiting', min: 180, filter: undefined, prev: undefined };
  }
  const raw = sample && Math.max(...sample.legs);
  if (!sample || raw === null || !Number.isFinite(raw) || raw < 0 || raw > 180) return s;
  const filter = s.filter ?? newFilter();
  const deg = filter.filter(raw, nowMs === undefined ? undefined : nowMs / 1000);
  // A threshold only counts once two consecutive samples are past it (NaN: no previous sample yet).
  const low = Math.max(deg, s.prev ?? NaN);
  const high = Math.min(deg, s.prev ?? NaN);
  s = { ...s, filter, prev: deg, lastSeenAt: nowMs ?? s.lastSeenAt };
  // Starting or resetting while crouched must not credit only the ascent as a full rep.
  if (s.phase === 'waiting')
    return high >= UP ? { ...s, phase: 'up', min: 180, attempt: fresh(nowMs) } : s;

  const a = s.attempt;
  const attempt: Attempt = {
    ...a,
    hip: Math.min(a.hip, sample.hip),
    sym: a.sym + Math.abs(sample.legs[0] - sample.legs[1]),
    n: a.n + 1,
    lean: Math.max(a.lean, sample.lean),
    valgus:
      sample.valgus === null || !Number.isFinite(sample.valgus)
        ? a.valgus
        : Math.min(a.valgus ?? Infinity, sample.valgus),
    bottomAt: low < s.min ? nowMs : a.bottomAt,
  };
  const min = Math.min(s.min, low);
  if (high >= UP) {
    const done = { ...s, phase: 'up' as const, min: 180, attempt: fresh(nowMs) };
    if (s.phase === 'down')
      return { ...done, reps: s.reps + 1, lastRep: report(attempt, min, true, nowMs) };
    if (min < SHALLOW && attempt.hip <= HIP_STARTED)
      return { ...done, noReps: s.noReps + 1, lastRep: report(attempt, min, false, nowMs) };
    return { ...s, min: 180, attempt: fresh(nowMs) };
  }
  // Bent knees without the hips dropping (kneeling, leaning in) is not a squat bottom.
  if (low <= DOWN && sample.hip <= HIP_BOTTOM) return { ...s, phase: 'down', min, attempt };
  return { ...s, min, attempt };
}
