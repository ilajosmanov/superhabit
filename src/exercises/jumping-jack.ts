import { Joint, SIDE } from 'superhabit-pose/joints';

import { cycle, type CycleState } from './cycle';
import { fmtMs, type Exercise } from './exercise';
import { angle, distance, seen, STRAIGHT, type Joints, type Pose } from './geometry';

const ARMS = [SIDE.left, SIDE.right].map(({ hip, shoulder, elbow }): Joints => [
  hip,
  shoulder,
  elbow,
]);
const REQUIRED = [...ARMS.flat(), Joint.LEFT_ANKLE, Joint.RIGHT_ANKLE];
const unit = (value: number) => Math.max(0, Math.min(1, value));

// Both signals run 0..1: arms from by the sides to straight overhead, spread from feet at hip
// width to WIDE hip widths apart. Device sets peak at ankles 1.6–1.9 hip widths; 2.5 was a bar
// most real jacks never cleared. A 0.7 peak needs ~126° arm abduction and feet 1.7 widths
// apart; closure allows arms within 45° of the sides and feet within 1.25 widths for pose noise.
const WIDE = 2;
const JACK_CLOSED = 0.25;
const JACK_OPEN = 0.7;
// A later signal crossing gives both limbs time to close before clean checks the raw sample.
const RETURN = 0.1;
const SHALLOW = 0.4;
// Moving elbows and overlapping ankles can be briefly uncertain; still require every joint
// inside the image, and reject visibility below 0.3 rather than using extrapolated limbs.
const MIN_VISIBILITY = 0.3;
// shortcut: experimental (marked in the app): with both limbs required closed, only 6/11 labelled clips meet
// the 60% gate. Cropped feet and inconsistent cycle totals remain; revisit with complete
// front-view device traces.

export type JumpingJackSample = {
  arms: number;
  spread: number;
  signal: number;
  joints: Joints;
};

export function measureJumpingJack(pose: Pose): JumpingJackSample | null {
  if (!REQUIRED.every((i) => seen(pose, i, MIN_VISIBILITY))) return null;
  const world = pose.worldLandmarks;
  const abduction = ARMS.map(([h, s, e]) => angle(world[h], world[s], world[e]));
  const ratio =
    distance(world[Joint.LEFT_ANKLE], world[Joint.RIGHT_ANKLE]) /
    distance(world[Joint.LEFT_HIP], world[Joint.RIGHT_HIP]);
  if (![...abduction, ratio].every(Number.isFinite)) return null;
  const arms = (abduction[0] + abduction[1]) / 2 / STRAIGHT;
  const spread = unit((ratio - 1) / (WIDE - 1));
  return { arms, spread, signal: Math.min(arms, spread), joints: ARMS[0] };
}

type Attempt = { arms: number; spread: number };
type JumpingJackReport = {
  counted: boolean;
  depth: number;
  downMs: number | null;
  upMs: number | null;
  cues: string[];
};
export type JumpingJackState = CycleState<Attempt, JumpingJackReport>;

const closed = (m: JumpingJackSample) => m.arms <= JACK_CLOSED && m.spread <= JACK_CLOSED;

const jackCycle = cycle<JumpingJackSample, Attempt, JumpingJackReport>({
  signal: (m) => m.signal,
  // Unit signals need a larger beta than degree signals; 0.8 follows quick cycles while
  // letting raw limbs finish closing. This preserves 6/11 traces with the closure check.
  smoothing: { minCutoff: 2, beta: 0.8 },
  up: RETURN,
  down: JACK_OPEN,
  shallow: SHALLOW,
  start: closed,
  // min(arms, spread) returns low when only one closes; both must close to finish a rep.
  clean: (_a, m) => closed(m),
  fresh: { arms: 0, spread: 0 },
  add: (a, m) => ({ arms: Math.max(a.arms, m.arms), spread: Math.max(a.spread, m.spread) }),
  report: (a, m, r) => ({
    ...r,
    cues: r.counted
      ? []
      : [
          !closed(m)
            ? 'Bring feet together and arms down'
            : a.arms < JACK_OPEN
              ? 'Raise your arms overhead'
              : a.spread < JACK_OPEN
                ? 'Jump your feet wider'
                : 'Raise arms and spread feet together',
        ],
  }),
});

export const jumpingJack: Exercise<JumpingJackState, JumpingJackSample> = {
  ...jackCycle,
  name: 'jumping jacks',
  experimental: true,
  glyph:
    'M13.4 5a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M16 8v10M16 10l-7-6M16 10l7-6M16 18l-6 9M16 18l6 9',
  placement: 'front-upright',
  place: 'Prop the phone upright',
  steps: [
    'Face the camera, about 2 m away',
    'Keep your feet and raised hands in frame',
    'Leave room to jump your feet apart',
  ],
  hint: 'Start with feet together and arms down. Jump wide with arms overhead, then return.',
  ready: 'Feet together, arms down',
  parts: ['head', 'hands', 'hips', 'feet'],
  gauge: { down: JACK_OPEN, up: RETURN },
  measure: measureJumpingJack,
  stats: ({ lastRep: r }) =>
    r && `${Math.round(r.depth * 100)}% OPEN · ${fmtMs(r.downMs)} out · ${fmtMs(r.upMs)} back`,
};
