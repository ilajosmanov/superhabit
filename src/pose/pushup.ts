// Side-on push-up counter on MediaPipe Pose Landmarker output (33 joints, MediaPipe order).
// Every measure is a 3D angle between joints, so it does not depend on how the phone lies.
// shortcut: no gravity check, so "push-ups in the air" standing with arms forward would count;
// add an accelerometer gravity vector if that shows up on device.
import { OneEuroFilter } from '1eurofilter';

import { angle, inFrame, type Pose } from './geometry';

// [shoulder, elbow, wrist, hip, knee, ankle]. Side-on, the far arm is often hidden, so only the better-seen side is used.
const SIDES = [
  [11, 13, 15, 23, 25, 27], // left
  [12, 14, 16, 24, 26, 28], // right
] as const;

// Starting guesses; tune on device.
export const PUSHUP_DOWN = 90; // elbow at or below = deep enough
export const PUSHUP_UP = 150; // elbow at or above = arms straight (soft lockouts read ~160)
export const PUSHUP_SHALLOW = 120; // bent past this without reaching DOWN = no-rep
export const BODY_MIN = 150; // shoulder–hip–ankle below this = sagging, piked or kneeling: not a push-up
export const REACH_MIN = 40; // hip–shoulder–wrist below this = arms by the sides (standing), not a plank
// Knee height above the wrist, in forearm lengths, at the top: ~0.5–0.8 on the toes, ~0–0.2 on the knees.
export const KNEES_MIN = 0.35;
export const PUSHUP_TRACKING_TIMEOUT_MS = 1000;
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
};

/** Null unless the better-seen arm, hip and knee or ankle are in frame and every angle is finite. */
export function measurePushup({ image, world }: Pose): PushupSample | null {
  const ok = (i: number) => inFrame(image[i]) && !!world[i];
  const seen = (side: readonly number[]) =>
    Math.min(...side.slice(0, 5).map((i) => image[i]?.visibility ?? 0));
  // The ankle is optional: heels low on the floor or past the frame edge drop out first.
  const usable = SIDES.filter((side) => side.slice(0, 5).every(ok));
  if (!usable.length) return null;
  const [s, e, w, h, k, a] = usable.reduce((best, side) => (seen(side) > seen(best) ? side : best));
  const foot = ok(a) ? a : k;
  const up = [world[e].x - world[w].x, world[e].y - world[w].y, world[e].z - world[w].z];
  const forearm = Math.hypot(...up);
  const knee = [world[k].x - world[w].x, world[k].y - world[w].y, world[k].z - world[w].z];
  const sample = {
    elbow: angle(world[s], world[e], world[w]),
    body: angle(world[s], world[h], world[foot]),
    reach: angle(world[h], world[s], world[w]),
    knees: (knee[0] * up[0] + knee[1] * up[1] + knee[2] * up[2]) / forearm ** 2,
  };
  return Object.values(sample).every(Number.isFinite) ? sample : null;
}

export type PushupReport = {
  counted: boolean;
  depth: number; // min smoothed elbow angle
  body: number; // lowest body line over the attempt
  downMs: number | null;
  upMs: number | null;
  cues: string[];
};

type Attempt = { body: number; startAt?: number; bottomAt?: number };

export type PushupState = {
  reps: number;
  noReps: number;
  /** 'waiting' = not yet seen in a plank top; nothing counts. */
  phase: 'waiting' | 'up' | 'down';
  min: number; // lowest held elbow angle since the last top
  lastRep: PushupReport | null;
  lastSeenAt?: number;
  // Mutable and stateful: call stepPushup once per sample and never replay an old state.
  filter?: OneEuroFilter;
  prev?: number;
  attempt: Attempt;
};

const fresh = (at?: number): Attempt => ({ body: 180, startAt: at });

export const initialPushup: PushupState = {
  reps: 0,
  noReps: 0,
  phase: 'waiting',
  min: 180,
  lastRep: null,
  attempt: fresh(),
};

function report(
  a: Attempt,
  depth: number,
  counted: boolean,
  nowMs?: number,
  kneeling = false,
): PushupReport {
  const downMs =
    a.bottomAt !== undefined && a.startAt !== undefined ? a.bottomAt - a.startAt : null;
  const upMs = nowMs !== undefined && a.bottomAt !== undefined ? nowMs - a.bottomAt : null;
  const cues = [
    !counted &&
      (kneeling
        ? 'Knees off the floor'
        : a.body < BODY_MIN
          ? 'Keep your body straight'
          : 'Go lower'),
    counted && a.body < CUE_BODY && 'Keep your body straight',
    downMs !== null && upMs !== null && downMs + upMs < CUE_FAST_MS && 'Slow down',
  ].filter((c): c is string => !!c);
  return { counted, depth, body: a.body, downMs, upMs, cues };
}

// Same filter settings as squats (degrees, ~15–30 Hz).
const newFilter = () => new OneEuroFilter(15, 1, 0.01);

/**
 * Same cycle as stepSquat, on the smoothed elbow angle: plank top -> elbows <= DOWN with a
 * straight body -> top again = rep; bent past SHALLOW without reaching DOWN = no-rep.
 */
export function stepPushup(
  s: PushupState,
  sample: PushupSample | null,
  nowMs?: number,
): PushupState {
  if (
    nowMs !== undefined &&
    s.lastSeenAt !== undefined &&
    nowMs - s.lastSeenAt > PUSHUP_TRACKING_TIMEOUT_MS &&
    (s.phase !== 'waiting' || s.filter)
  ) {
    s = { ...s, phase: 'waiting', min: 180, filter: undefined, prev: undefined };
  }
  if (!sample || !Number.isFinite(sample.elbow) || sample.elbow < 0 || sample.elbow > 180) return s;
  const filter = s.filter ?? newFilter();
  const deg = filter.filter(sample.elbow, nowMs === undefined ? undefined : nowMs / 1000);
  // A threshold only counts once two consecutive samples are past it (NaN: no previous sample yet).
  const low = Math.max(deg, s.prev ?? NaN);
  const high = Math.min(deg, s.prev ?? NaN);
  s = { ...s, filter, prev: deg, lastSeenAt: nowMs ?? s.lastSeenAt };
  const kneeling = sample.knees < KNEES_MIN;
  const plank = sample.body >= BODY_MIN && sample.reach >= REACH_MIN && !kneeling;
  if (s.phase === 'waiting')
    return high >= PUSHUP_UP && plank ? { ...s, phase: 'up', min: 180, attempt: fresh(nowMs) } : s;

  const attempt: Attempt = {
    ...s.attempt,
    body: Math.min(s.attempt.body, sample.body),
    bottomAt: low < s.min ? nowMs : s.attempt.bottomAt,
  };
  const min = Math.min(s.min, low);
  if (high >= PUSHUP_UP) {
    const done = { ...s, phase: 'up' as const, min: 180, attempt: fresh(nowMs) };
    if (s.phase === 'down' && !kneeling && attempt.body >= BODY_MIN)
      return { ...done, reps: s.reps + 1, lastRep: report(attempt, min, true, nowMs) };
    if (s.phase === 'down')
      return {
        ...done,
        noReps: s.noReps + 1,
        lastRep: report(attempt, min, false, nowMs, kneeling),
      };
    if (min < PUSHUP_SHALLOW && plank)
      return { ...done, noReps: s.noReps + 1, lastRep: report(attempt, min, false, nowMs) };
    return { ...s, min: 180, attempt: fresh(nowMs) };
  }
  // Sagging hips never reach the bottom, so such a rep can only end as a no-rep.
  if (low <= PUSHUP_DOWN && sample.body >= BODY_MIN) return { ...s, phase: 'down', min, attempt };
  return { ...s, min, attempt };
}
