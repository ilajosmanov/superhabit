import { SIDE } from 'superhabit-pose/joints';

import { cycle, type CycleState } from '@/exercises/kinds/cycle';
import { fmtMs, SETUP, type Exercise } from './exercise';
import { angle, bestSide, sub, tilt, type Joints, type Pose } from '@/exercises/body/geometry';

// Lying flat reads ~175° at the hip, legs straight up 90°. Start below 160°, count past 100°.
const RAISE_UP = 160;
const RAISE_DOWN = 100;
const SHALLOW = 135;
const KNEES_MIN = 140;
// Degrees the torso may rise off level: more is a sit-up or a V-up, not a leg raise.
const TORSO_MAX = 30;
// A refused rep that lost the body for this many frames (~1/3 s) is a framing problem, not form.
const UNSEEN_MAX = 5;
// shortcut: textbook angles, no leg raise traces yet; tune on device sets. The torso check takes
// world y as down, as squat's lean does; revisit if a tilted floor phone refuses good reps.

/** Angles on the better-seen complete side, in degrees. */
export type LegRaiseSample = {
  /** Torso to thigh. */
  hip: number;
  knee: number;
  /** Torso off level. */
  torso: number;
  joints: Joints;
};

export function measureLegRaise(pose: Pose): LegRaiseSample | null {
  const side = bestSide(pose, (j) => [j.shoulder, j.hip, j.knee, j.ankle]);
  if (!side) return null;
  const { shoulder: s, hip: h, knee: k, ankle: a } = SIDE[side];
  const w = pose.worldLandmarks;
  const shape = {
    hip: angle(w[s], w[h], w[k]),
    knee: angle(w[h], w[k], w[a]),
    torso: Math.abs(90 - tilt(sub(w[h], w[s]))),
  };
  return Object.values(shape).every(Number.isFinite) ? { ...shape, joints: [s, h, k] } : null;
}

/** The most bent knee and the most raised torso over the attempt. */
type Attempt = { knee: number; torso: number };
type LegRaiseReport = {
  counted: boolean;
  depth: number;
  knee: number;
  torso: number;
  downMs: number | null;
  upMs: number | null;
  cues: string[];
};
export type LegRaiseState = CycleState<Attempt, LegRaiseReport>;

const flat = (m: LegRaiseSample) => m.knee >= KNEES_MIN && m.torso <= TORSO_MAX;
const legRaiseCycle = cycle<LegRaiseSample, Attempt, LegRaiseReport>({
  signal: (m) => m.hip,
  up: RAISE_UP,
  down: RAISE_DOWN,
  shallow: SHALLOW,
  start: flat,
  turn: flat,
  clean: (a) => a.knee >= KNEES_MIN && a.torso <= TORSO_MAX,
  fresh: { knee: 180, torso: 0 },
  add: (a, m) => ({ knee: Math.min(a.knee, m.knee), torso: Math.max(a.torso, m.torso) }),
  report: (a, _m, r) => ({
    ...r,
    knee: a.knee,
    torso: a.torso,
    cues: r.counted
      ? []
      : [
          a.knee < KNEES_MIN
            ? 'Keep your legs straight'
            : a.torso > TORSO_MAX
              ? 'Keep your back on the floor'
              : r.unseen > UNSEEN_MAX
                ? 'Keep your whole body in frame'
                : 'Raise your legs higher',
        ],
  }),
});

export const legRaise: Exercise<LegRaiseState, LegRaiseSample> = {
  ...legRaiseCycle,
  name: 'leg raises',
  placement: 'side-floor',
  ...SETUP['side-floor'],
  hint: 'Lie flat with legs straight. Raise them to vertical, then lower to count.',
  ready: 'Lie flat, legs straight',
  parts: ['head', 'hips', 'feet'],
  gauge: { down: RAISE_DOWN, up: RAISE_UP },
  measure: measureLegRaise,
  stats: ({ lastRep: r }) =>
    r &&
    `${Math.round(r.depth)}° · KNEE ${Math.round(r.knee)}° · TORSO ${Math.round(r.torso)}° · ${fmtMs(r.downMs)}↑ ${fmtMs(r.upMs)}↓`,
};
