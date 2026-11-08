import { Joint, SIDE } from 'superhabit-pose/joints';

import { fmtMs, SETUP, type Exercise } from './exercise';
import {
  add,
  angle,
  dot,
  length,
  seen,
  sub,
  tilt,
  type Joints,
  type Pose,
  type Side,
  type Vec,
} from './geometry';
import { sided, type SidedState } from './sided';

// Local trace sweep with rear recovery >= SHALLOW: up 140–160°, down 100–120°,
// lean 30–40°, stride 0.2–0.4 and visibility 0.2–0.5 never exceeded 5/15 clips.
// Allow 25° of depth/lockout estimation error around a right-angle knee / straight leg.
// Keep the front thigh at least sin⁻¹(0.4) ≈ 24° ahead of vertical.
const LUNGE_DOWN = 115;
const LUNGE_UP = 140;
const SHALLOW = 130;
// Resume the actual angle before lockout so smoothing sees the ascent, even as the stride closes.
// Keep this at SHALLOW: feeding a rear knee below it lets gradual motion create a false
// shallow attempt, which overwrites the front leg's clean report on the return to standing.
const RECOVER = SHALLOW;
// Device sets: clean lunges lean 4–10°, deliberately sloppy ones 15° and up.
const LEAN_MAX = 15;
const STRIDE_MIN = 0.4;
// Labelled internet clips pass 5/15 (front and rear views, missing legs); device sets are the bar.

type Leg = { knee: number; forward: number; joints: Joints };
/** Each side keeps its own angle; an occluded leg never borrows the visible leg's signal. */
export type LungeSample = { left: Leg | null; right: Leg | null; lean: number; joints: Joints };

export function measureLunge(pose: Pose): LungeSample | null {
  const world = pose.worldLandmarks;
  const lh = world[Joint.LEFT_HIP];
  const rh = world[Joint.RIGHT_HIP];
  if (!lh || !rh) return null;
  // The hip axis crossed with vertical gives the horizontal axis the lunge strides along.
  const ahead: Vec = { x: lh.z - rh.z, y: 0, z: rh.x - lh.x };
  const width = length(ahead);
  if (!Number.isFinite(width) || width === 0) return null;

  // Sum the seen shoulder-to-hip vectors: one side alone reads shoulder/hip width as lean.
  const trunk = Object.values(SIDE)
    .filter(({ shoulder, hip }) => [shoulder, hip].every((i) => seen(pose, i)))
    .map(({ shoulder, hip }) => sub(world[hip], world[shoulder]))
    .reduce(add, { x: 0, y: 0, z: 0 });
  const lean = tilt(trunk);
  if (!Number.isFinite(lean)) return null;

  function leg(side: Side): Leg | null {
    const { shoulder: s, hip: h, knee: k, ankle: a } = SIDE[side];
    if (![s, h, k, a].every((i) => seen(pose, i))) return null;
    const thigh = sub(world[k], world[h]);
    const knee = angle(world[h], world[k], world[a]);
    const forward = dot(thigh, ahead) / (width * length(thigh));
    return [knee, forward].every(Number.isFinite) ? { knee, forward, joints: [h, k, a] } : null;
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
  placement: 'side-upright',
  ...SETUP['side-upright'],
  hint: 'Stand tall to start. Each front-leg lunge counts once.',
  ready: 'Stand tall',
  how: [
    `Step forward until your front knee reaches ${LUNGE_DOWN}°`,
    'Each front-leg lunge counts once',
  ],
  parts: ['head', 'hips', 'feet'],
  gauge: { down: LUNGE_DOWN, up: LUNGE_UP },
  measure: measureLunge,
  stats: ({ lastRep: r }) =>
    r &&
    `${Math.round(r.depth)}° · ${fmtMs(r.downMs)}↓ ${fmtMs(r.upMs)}↑ · LEAN ${Math.round(r.lean)}°`,
};
