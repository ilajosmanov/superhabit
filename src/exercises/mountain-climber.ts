import { SIDE } from 'superhabit-pose/joints';

import { fmtMs, SETUP, type Exercise } from './exercise';
import {
  angle,
  bestSide,
  between,
  seen,
  STRAIGHT,
  sub,
  type Joints,
  type Pose,
  type Side,
} from './geometry';
import { sided, type SidedState } from './sided';

// Side-on knees are frequently occluded; accept visibility 0.2 but never borrow the other leg.
const MIN_VISIBILITY = 0.2;
// Keep a 30° excursion: return to within 45° of straight and drive at least 75° into
// hip flexion. Fast traces often never reach 135°; a permissive 120°/110° cycle has
// only 10° of excursion and still misses the accuracy bar. Keep a full drive and return.
const CLIMBER_UP = 135;
const CLIMBER_DOWN = 105;
const SHALLOW = 115;
// A floor-facing torso may slope with the hips lifted during a drive. The shoulder–wrist
// line must be within 45° of the support-line normal (offset no greater than its height).
const TORSO_MAX = 40;
const WRIST_MAX = 45;
// Allow up to 45° of pike in the supporting body line, close to plank's 137° gate.
// A knee drive can briefly bend both knees, so do not require a locked supporting knee.
const BODY_MIN = 135;
// shortcut: experimental (marked in the app): only 3/19 labelled clips meet the 60% gate (12 needed).
// Revisit fast-motion hip reconstruction and occluded legs with side-floor device traces.

type Leg = { hip: number; joints: Joints };
export type MountainClimberSample = {
  left: Leg | null;
  right: Leg | null;
  /** Torso tilt from the ankle–wrist line and arm tilt from its perpendicular, in degrees. */
  torso: number;
  wrist: number;
  /** Shoulder–hip–ankle angle of the more extended, supporting leg. */
  body: number;
  joints: Joints;
};

/** Independent shoulder–hip–knee angles; support can use the better-seen arm. */
export function measureMountainClimber(pose: Pose): MountainClimberSample | null {
  const world = pose.worldLandmarks;
  const visible = (i: number) => seen(pose, i, MIN_VISIBILITY);
  const arm = bestSide(pose, (j) => [j.shoulder, j.hip, j.wrist], MIN_VISIBILITY);
  if (!arm) return null;
  const { shoulder: s, hip: h, wrist: w } = SIDE[arm];
  function leg(side: Side): Leg | null {
    const { shoulder, hip, knee } = SIDE[side];
    if (![shoulder, hip, knee].every(visible)) return null;
    const flexion = angle(world[shoulder], world[hip], world[knee]);
    return Number.isFinite(flexion) ? { hip: flexion, joints: [shoulder, hip, knee] } : null;
  }
  const left = leg('left');
  const right = leg('right');
  const feet = Object.values(SIDE).flatMap(({ shoulder, hip, ankle }) => {
    if (![shoulder, hip, ankle].every(visible)) return [];
    const body = angle(world[shoulder], world[hip], world[ankle]);
    return Number.isFinite(body) ? [{ ankle, body }] : [];
  });
  if (!feet.length) return null;
  // Like plank, use the wrist–ankle support line as the floor reference. Prefer the
  // straightest shoulder–hip–ankle line: the driving foot can leave the floor, and
  // the supporting knee can be hidden while its ankle is still visible. Relative
  // vectors survive raw sensor rotations; without gravity, this is a shape gate.
  const { ankle: a, body } = feet.reduce((best, foot) => (foot.body > best.body ? foot : best));
  const slope = between(sub(world[h], world[s]), sub(world[a], world[w]));
  const torso = Math.min(slope, STRAIGHT - slope);
  const wrist = Math.abs(STRAIGHT / 2 - angle(world[s], world[w], world[a]));
  if (![torso, wrist, body].every(Number.isFinite)) return null;
  const driving = left && right ? (left.hip < right.hip ? left : right) : (left ?? right);
  return driving ? { left, right, torso, wrist, body, joints: driving.joints } : null;
}

type Attempt = { supported: boolean };
type ClimberReport = {
  counted: boolean;
  depth: number;
  downMs: number | null;
  upMs: number | null;
  cues: string[];
};
export type MountainClimberState = SidedState<Attempt, ClimberReport>;

const supported = (m: MountainClimberSample) =>
  m.torso <= TORSO_MAX && m.wrist <= WRIST_MAX && m.body >= BODY_MIN;
const counter = sided<MountainClimberSample, Attempt, ClimberReport>({
  signal: (m, side) => m[side]?.hip ?? null,
  up: CLIMBER_UP,
  down: CLIMBER_DOWN,
  shallow: SHALLOW,
  start: supported,
  fresh: { supported: true },
  add: (a, m) => ({ supported: a.supported && supported(m) }),
  clean: (a) => a.supported,
  report: (a, _m, r) => ({
    ...r,
    cues: r.counted
      ? []
      : [
          a.supported
            ? 'Drive your knee closer to your chest'
            : 'Keep a plank with hands under shoulders',
        ],
  }),
});

export const mountainClimber: Exercise<MountainClimberState, MountainClimberSample> = {
  ...counter,
  name: 'mountain climbers',
  experimental: true,
  glyph: 'M23.4 12a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M23 15 6 21M15 18l-3 5M3 26h26',
  placement: 'side-floor',
  ...SETUP['side-floor'],
  hint: 'Start in a high plank. Each knee drive and return counts once.',
  ready: 'Get into a high plank',
  parts: ['head', 'hands', 'hips', 'feet'],
  gauge: { down: CLIMBER_DOWN, up: CLIMBER_UP },
  measure: measureMountainClimber,
  stats: ({ lastRep: r }) => r && `${Math.round(r.depth)}° · ${fmtMs(r.downMs)}↓ ${fmtMs(r.upMs)}↑`,
};
