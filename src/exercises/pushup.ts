// Side-on push-up counter on MediaPipe Pose Landmarker output (33 joints, MediaPipe order).
// Every measure is a 3D angle between joints, so it does not depend on how the phone lies.
// shortcut: no gravity check, so "push-ups in the air" standing with arms forward would count;
// add an accelerometer gravity vector if that shows up on device.
import { SIDE } from 'superhabit-pose/joints';

import {
  angle,
  bestSide,
  dot,
  length,
  seen,
  STRAIGHT,
  sub,
  type Joints,
  type Pose,
} from '@/exercises/body/geometry';
import { cycle, type CycleState } from '@/exercises/kinds/cycle';
import { fmtMs, SETUP, type Exercise } from './exercise';

// Starting guesses; tune on device.
// A true side-on view reads the elbow ~15° shallower than a 45° view; 90 rejected real reps there.
const PUSHUP_DOWN = 100; // elbow at or below = deep enough
const PUSHUP_UP = 150; // elbow at or above = arms straight (soft lockouts read ~160)
const PUSHUP_SHALLOW = 120; // bent past this without reaching DOWN = no-rep
const BODY_MIN = 150; // shoulder–hip–ankle below this = sagging, piked or kneeling: not a push-up
const REACH_MIN = 40; // hip–shoulder–wrist below this = arms by the sides (standing), not a plank
// Knee height above the wrist, in forearm lengths, at the top: ~0.5–0.8 on the toes, ~0–0.2 on the knees.
const KNEES_MIN = 0.35;
const CUE_BODY = 165; // counted, but still worth a cue
const CUE_FAST_MS = 600;

/** One frame, better-seen side only. Degrees. */
export type PushupSample = {
  /** shoulder–elbow–wrist: ~170 at the top, ~70–90 at the bottom. */
  elbow: number;
  /** shoulder–hip–ankle (shoulder–hip–knee when the heels are out of view): 180 = straight body. */
  body: number;
  /** hip–shoulder–wrist: ~60–90 in a plank, ~0–20 standing with arms down. */
  reach: number;
  /**
   * Knee height above the wrist along the forearm, in forearm lengths. The forearm stays roughly
   * upright, so it stands in for "up from the floor" without knowing how the phone lies.
   */
  knees: number;
  /** [shoulder, elbow, wrist] of the side measured. */
  joints: Joints;
};

/** Null unless the better-seen arm, hip and knee or ankle are in frame and every angle is finite. */
export function measurePushup(pose: Pose): PushupSample | null {
  // Push-ups can fall back to the knee when the ankle is out of view.
  const side = bestSide(pose, (j) => [j.shoulder, j.elbow, j.wrist, j.hip, j.knee]);
  if (!side) return null;
  const { shoulder: s, elbow: e, wrist: w, hip: h, knee: k, ankle: a } = SIDE[side];
  const world = pose.worldLandmarks;
  const foot = seen(pose, a) ? a : k;
  const forearm = sub(world[e], world[w]);
  const angles = {
    elbow: angle(world[s], world[e], world[w]),
    body: angle(world[s], world[h], world[foot]),
    reach: angle(world[h], world[s], world[w]),
    knees: dot(sub(world[k], world[w]), forearm) / length(forearm) ** 2,
  };
  const joints: Joints = [s, e, w];
  return Object.values(angles).every(Number.isFinite) ? { ...angles, joints } : null;
}

type PushupReport = {
  counted: boolean;
  depth: number; // min smoothed elbow angle
  body: number; // lowest body line over the attempt
  downMs: number | null;
  upMs: number | null;
  cues: string[];
};

type Attempt = { body: number };

/** Tracks the elbow angle; 'waiting' until seen in a plank top. */
export type PushupState = CycleState<Attempt, PushupReport>;

const plank = (m: PushupSample) =>
  m.body >= BODY_MIN && m.reach >= REACH_MIN && m.knees >= KNEES_MIN;

const pushupCycle = cycle<PushupSample, Attempt, PushupReport>({
  signal: (m) => m.elbow,
  up: PUSHUP_UP,
  down: PUSHUP_DOWN,
  shallow: PUSHUP_SHALLOW,
  start: plank,
  turn: (m) => m.body >= BODY_MIN,
  clean: (a, m) => m.knees >= KNEES_MIN && a.body >= BODY_MIN,
  tried: (_a, m) => plank(m),
  fresh: { body: STRAIGHT },
  add: (a, m) => ({ body: Math.min(a.body, m.body) }),
  report: (a, m, { counted, depth, downMs, upMs }) => {
    const fast = downMs !== null && upMs !== null && downMs + upMs < CUE_FAST_MS;
    const cues = [
      !counted &&
        (m.knees < KNEES_MIN
          ? 'Knees off the floor'
          : a.body < BODY_MIN
            ? 'Keep your body straight'
            : 'Go lower'),
      counted && a.body < CUE_BODY && 'Keep your body straight',
      fast && 'Slow down',
    ].filter((c): c is string => !!c);
    return { counted, depth, body: a.body, downMs, upMs, cues };
  },
});

export const pushup: Exercise<PushupState, PushupSample> = {
  ...pushupCycle,
  name: 'push-ups',
  placement: 'side-floor',
  ...SETUP['side-floor'],
  hint: 'Counting starts once you hold a plank.',
  ready: 'Get into a plank',
  // Feet too: counting falls back to the knees, but the body line reads best heel to shoulder.
  parts: ['head', 'hands', 'hips', 'feet'],
  gauge: { down: PUSHUP_DOWN, up: PUSHUP_UP },
  measure: measurePushup,
  stats: ({ lastRep: r }) =>
    r &&
    `${Math.round(r.depth)}° · BODY ${Math.round(r.body)}° · ${fmtMs(r.downMs)}↓ ${fmtMs(r.upMs)}↑`,
};
