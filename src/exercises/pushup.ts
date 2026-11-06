// Side-on push-up counter on MediaPipe Pose Landmarker output (33 joints, MediaPipe order).
// Every measure is a 3D angle between joints, so it does not depend on how the phone lies.
// shortcut: no gravity check, so "push-ups in the air" standing with arms forward would count;
// add an accelerometer gravity vector if that shows up on device.
import { Joint } from 'superhabit-pose/joints';

import { angle, inFrame, inFrameWithVisibility, type Joints, type Pose } from './geometry';
import { cycle, type CycleState } from './cycle';
import { fmtMs, type Exercise } from './exercise';

// [shoulder, elbow, wrist, hip, knee, ankle]. Side-on, the far arm is often hidden, so only the better-seen side is used.
const SIDES = [
  [
    Joint.LEFT_SHOULDER,
    Joint.LEFT_ELBOW,
    Joint.LEFT_WRIST,
    Joint.LEFT_HIP,
    Joint.LEFT_KNEE,
    Joint.LEFT_ANKLE,
  ],
  [
    Joint.RIGHT_SHOULDER,
    Joint.RIGHT_ELBOW,
    Joint.RIGHT_WRIST,
    Joint.RIGHT_HIP,
    Joint.RIGHT_KNEE,
    Joint.RIGHT_ANKLE,
  ],
] as const;

// Starting guesses; tune on device.
export const PUSHUP_DOWN = 90; // elbow at or below = deep enough
export const PUSHUP_UP = 150; // elbow at or above = arms straight (soft lockouts read ~160)
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

/** Better-seen arm and leg; plank requires the ankle, push-ups can fall back to the knee. */
export function pushupSide(
  { landmarks: image, worldLandmarks: world }: Pose,
  minVisibility = 0.5,
  requireAnkle = false,
) {
  const ok = (i: number) => inFrameWithVisibility(image[i], minVisibility) && !!world[i];
  const required = (side: readonly number[]) => (requireAnkle ? side : side.slice(0, 5));
  const seen = (side: readonly number[]) =>
    Math.min(...required(side).map((i) => image[i]?.visibility ?? 0));
  const usable = SIDES.filter((side) => required(side).every(ok));
  if (!usable.length) return null;
  return usable.reduce((best, side) => (seen(side) > seen(best) ? side : best));
}

/** Null unless the better-seen arm, hip and knee or ankle are in frame and every angle is finite. */
export function measurePushup(pose: Pose): PushupSample | null {
  const side = pushupSide(pose);
  if (!side) return null;
  const [s, e, w, h, k, a] = side;
  const { landmarks: image, worldLandmarks: world } = pose;
  const foot = inFrame(image[a]) && world[a] ? a : k;
  const up = [world[e].x - world[w].x, world[e].y - world[w].y, world[e].z - world[w].z];
  const forearm = Math.hypot(...up);
  const knee = [world[k].x - world[w].x, world[k].y - world[w].y, world[k].z - world[w].z];
  const angles = {
    elbow: angle(world[s], world[e], world[w]),
    body: angle(world[s], world[h], world[foot]),
    reach: angle(world[h], world[s], world[w]),
    knees: (knee[0] * up[0] + knee[1] * up[1] + knee[2] * up[2]) / forearm ** 2,
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
  fresh: { body: 180 },
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
  glyph: 'M23.4 12a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M23 15L5 22M21 15.8l.6 9.2M3 26h26',
  placement: 'side-floor',
  place: 'Turn the phone sideways',
  steps: [
    'Lay it on the floor on its long edge',
    'About 2 m away, side-on to you',
    'Head to feet in frame',
  ],
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

export const initialPushup = pushup.initial;
export function stepPushup(
  s: PushupState,
  sample: PushupSample | null,
  nowMs: number,
): PushupState {
  return pushup.step(s, sample, nowMs);
}
