import { Joint } from 'superhabit-pose/joints';

import { fmtMs, type Exercise } from './exercise';
import { angle, inFrameWithVisibility, type Joints, type Pose } from './geometry';
import { sided, type Side, type SidedState } from './sided';

const SIDES = {
  left: [Joint.LEFT_SHOULDER, Joint.LEFT_HIP, Joint.LEFT_KNEE, Joint.LEFT_WRIST, Joint.LEFT_ANKLE],
  right: [
    Joint.RIGHT_SHOULDER,
    Joint.RIGHT_HIP,
    Joint.RIGHT_KNEE,
    Joint.RIGHT_WRIST,
    Joint.RIGHT_ANKLE,
  ],
} as const;

// Side-on knees are frequently occluded; accept visibility 0.2 but never borrow the other leg.
const MIN_VISIBILITY = 0.2;
// Keep a 30° excursion: return to within 45° of straight and drive at least 75° into
// hip flexion. Fast traces often never reach 135°; a permissive 120°/110° cycle has
// only 10° of excursion and still misses the accuracy bar. Keep a full drive and return.
export const CLIMBER_UP = 135;
export const CLIMBER_DOWN = 105;
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
export function measureMountainClimber({
  landmarks: image,
  worldLandmarks: world,
}: Pose): MountainClimberSample | null {
  const seen = (i: number) => inFrameWithVisibility(image[i], MIN_VISIBILITY) && !!world[i];
  const arms = Object.values(SIDES).filter(([s, h, , w]) => [s, h, w].every(seen));
  if (!arms.length) return null;
  const visibility = ([s, h, , w]: readonly number[]) =>
    Math.min(...[s, h, w].map((i) => image[i].visibility));
  const [s, h, , w] = arms.reduce((best, arm) => (visibility(arm) > visibility(best) ? arm : best));
  if (![s, h, w].every((i) => [world[i].x, world[i].y, world[i].z].every(Number.isFinite)))
    return null;
  function leg(side: Side): Leg | null {
    const [shoulder, hip, knee] = SIDES[side];
    if (![shoulder, hip, knee].every(seen)) return null;
    const flexion = angle(world[shoulder], world[hip], world[knee]);
    return Number.isFinite(flexion) ? { hip: flexion, joints: [shoulder, hip, knee] } : null;
  }
  const left = leg('left');
  const right = leg('right');
  const feet = Object.values(SIDES).flatMap(([shoulder, hip, , , ankle]) => {
    if (![shoulder, hip, ankle].every(seen)) return [];
    const body = angle(world[shoulder], world[hip], world[ankle]);
    return Number.isFinite(body) ? [{ ankle, body }] : [];
  });
  if (!feet.length) return null;
  // Like plank, use the wrist–ankle support line as the floor reference. Prefer the
  // straightest shoulder–hip–ankle line: the driving foot can leave the floor, and
  // the supporting knee can be hidden while its ankle is still visible. Relative
  // vectors survive raw sensor rotations; without gravity, this is a shape gate.
  const { ankle: a, body } = feet.reduce((best, foot) => (foot.body > best.body ? foot : best));
  const support = [world[a].x - world[w].x, world[a].y - world[w].y, world[a].z - world[w].z];
  const trunk = [world[h].x - world[s].x, world[h].y - world[s].y, world[h].z - world[s].z];
  const cos =
    (trunk[0] * support[0] + trunk[1] * support[1] + trunk[2] * support[2]) /
    (Math.hypot(...trunk) * Math.hypot(...support));
  const torso = (Math.acos(Math.min(1, Math.abs(cos))) * 180) / Math.PI;
  const wrist = Math.abs(90 - angle(world[s], world[w], world[a]));
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
  per: 'side',
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
  place: 'Turn the phone sideways',
  steps: [
    'Lay it on the floor on its long edge',
    'About 2 m away, side-on to you',
    'Head to feet in frame',
  ],
  hint: 'Start in a high plank. Each knee drive and return counts once.',
  ready: 'Get into a high plank',
  parts: ['head', 'hands', 'hips', 'feet'],
  gauge: { down: CLIMBER_DOWN, up: CLIMBER_UP },
  measure: measureMountainClimber,
  stats: ({ lastRep: r }) =>
    r && `${r.depth === null ? '—' : Math.round(r.depth)}° · ${fmtMs(r.upMs)}↑`,
};
