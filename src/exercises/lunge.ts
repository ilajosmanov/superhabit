import { Joint } from 'superhabit-pose/joints';

import { fmtMs, type Exercise } from './exercise';
import { angle, inFrame, type Joints, type Pose } from './geometry';
import { sided, type Side, type SidedState } from './sided';

const SIDES = {
  left: [Joint.LEFT_SHOULDER, Joint.LEFT_HIP, Joint.LEFT_KNEE, Joint.LEFT_ANKLE],
  right: [Joint.RIGHT_SHOULDER, Joint.RIGHT_HIP, Joint.RIGHT_KNEE, Joint.RIGHT_ANKLE],
} as const;

// Local trace sweep with rear recovery >= SHALLOW: up 140–160°, down 100–120°,
// lean 30–40°, stride 0.2–0.4 and visibility 0.2–0.5 never exceeded 5/15 clips.
// Allow 25° of depth/lockout estimation error around a right-angle knee / straight leg.
// Keep upright within 35° and the front thigh at least sin⁻¹(0.4) ≈ 24° ahead of vertical.
export const LUNGE_DOWN = 115;
export const LUNGE_UP = 155;
const SHALLOW = 140;
// Resume the actual angle before lockout so smoothing sees the ascent, even as the stride closes.
// Keep this at SHALLOW: feeding a rear knee below it lets gradual motion create a false
// shallow attempt, which overwrites the front leg's clean report on the return to standing.
const RECOVER = SHALLOW;
const LEAN_MAX = 35;
const STRIDE_MIN = 0.4;
// shortcut: experimental (marked in the app): only 5/15 labelled clips meet the 60% gate (9 needed). Revisit
// front/rear tracking and missing legs on side-upright device traces before exposing lunges.

type Leg = { knee: number; forward: number; joints: Joints };
/** Each side keeps its own angle; an occluded leg never borrows the visible leg's signal. */
export type LungeSample = { left: Leg | null; right: Leg | null; lean: number; joints: Joints };

export function measureLunge({
  landmarks: image,
  worldLandmarks: world,
}: Pose): LungeSample | null {
  const lh = world[Joint.LEFT_HIP];
  const rh = world[Joint.RIGHT_HIP];
  if (!lh || !rh) return null;
  // Anatomical right-to-left hip axis crossed with vertical gives the forward horizontal axis.
  const fx = lh.z - rh.z;
  const fz = rh.x - lh.x;
  const width = Math.hypot(fx, fz);
  if (!Number.isFinite(width) || width === 0) return null;

  // Average the visible shoulder-to-hip vectors: a single side includes shoulder/hip width
  // differences as apparent lean. Fall back to one torso side when the other is occluded.
  const torsos = Object.values(SIDES).filter(([s, h]) =>
    [s, h].every((i) => inFrame(image[i]) && !!world[i]),
  );
  const trunk = torsos.reduce(
    (sum, [s, h]) => ({
      x: sum.x + world[h].x - world[s].x,
      y: sum.y + world[h].y - world[s].y,
      z: sum.z + world[h].z - world[s].z,
    }),
    { x: 0, y: 0, z: 0 },
  );
  const lean =
    (Math.acos(Math.min(1, Math.max(-1, trunk.y / Math.hypot(trunk.x, trunk.y, trunk.z)))) * 180) /
    Math.PI;
  if (!Number.isFinite(lean)) return null;

  function leg(side: Side): Leg | null {
    const [, h, k, a] = SIDES[side];
    if (!SIDES[side].every((i) => inFrame(image[i]) && !!world[i])) return null;
    const thigh = Math.hypot(
      world[k].x - world[h].x,
      world[k].y - world[h].y,
      world[k].z - world[h].z,
    );
    const knee = angle(world[h], world[k], world[a]);
    const forward =
      ((world[k].x - world[h].x) * fx + (world[k].z - world[h].z) * fz) / (width * thigh);
    return [knee, forward].every(Number.isFinite)
      ? {
          knee,
          forward,
          joints: [h, k, a],
        }
      : null;
  }

  const left = leg('left');
  const right = leg('right');
  // The front leg owns the angle being counted and drawn, even when the rear is nearer the camera.
  const front = left && right ? (right.forward > left.forward ? right : left) : (left ?? right);
  if (!front) return null;
  return { left, right, lean, joints: front.joints };
}

type Attempt = { lean: number };
type LungeReport = {
  counted: boolean;
  depth: number;
  lean: number;
  downMs: number | null;
  upMs: number | null;
  cues: string[];
};
export type LungeState = SidedState<Attempt, LungeReport>;

const lungeCounter = sided<LungeSample, Attempt, LungeReport>({
  // Dataset labels count each descent, including alternating legs, rather than left/right pairs.
  per: 'side',
  signal: (m, side) => {
    const leg = m[side];
    if (!leg) return null;
    const other = m[side === 'left' ? 'right' : 'left'];
    // A straight knee can establish the start. Once bent, only the front thigh may cycle;
    // the rear knee also bends in a lunge, and symmetric squats must not count twice.
    // cycle still records torso form while the stride closes and this signal is gated out.
    return leg.knee >= RECOVER ||
      (leg.forward >= STRIDE_MIN && (!other || leg.forward - other.forward >= STRIDE_MIN))
      ? leg.knee
      : null;
  },
  up: LUNGE_UP,
  down: LUNGE_DOWN,
  shallow: SHALLOW,
  start: (m) => m.lean <= LEAN_MAX,
  clean: (a) => a.lean <= LEAN_MAX,
  fresh: { lean: 0 },
  add: (a, m) => ({ lean: Math.max(a.lean, m.lean) }),
  report: (a, _m, r) => ({
    ...r,
    lean: a.lean,
    cues: r.counted ? [] : [a.lean > LEAN_MAX ? 'Keep your torso upright' : 'Go lower'],
  }),
});

export const lunge: Exercise<LungeState, LungeSample> = {
  ...lungeCounter,
  name: 'lunges',
  experimental: true,
  glyph:
    'M13.4 5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M16 8v9M16 17l6 3v6M16 17l-6 5-3 4M3 26h26',
  placement: 'side-upright',
  place: 'Stand the phone upright',
  steps: ['Prop it up on its short edge', '2 to 3 m away, side-on to you', 'Head to feet in frame'],
  hint: 'Stand tall to start. Each front-leg lunge counts once.',
  ready: 'Stand tall',
  parts: ['head', 'hips', 'feet'],
  gauge: { down: LUNGE_DOWN, up: LUNGE_UP },
  measure: measureLunge,
  stats: ({ lastRep: r }) =>
    r && `${r.depth === null ? '—' : Math.round(r.depth)}° · ${fmtMs(r.upMs)}↑`,
};
