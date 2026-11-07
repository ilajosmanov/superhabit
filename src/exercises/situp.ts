import { SIDE } from 'superhabit-pose/joints';

import { cycle, type CycleState } from './cycle';
import { fmtMs, SETUP, type Exercise } from './exercise';
import {
  angle,
  bestSide,
  dot,
  length,
  reject,
  seen,
  sub,
  type Joints,
  type Pose,
} from './geometry';

// Bent thighs make a lying hip read nearer 120° than 180°; 80° requires the torso to curl up.
// Trace tuning across up 65–100°, down 95–135° and visibility 0.1–0.5 never exceeded 3/10.
// Keep a 35° excursion and normal visibility rather than admitting small crunches or hidden feet.
const SITUP_UP = 80;
const SITUP_DOWN = 115;
const SHALLOW = 95;
// At least 40° short of straight throughout the attempt, not just at its endpoints.
const KNEES_MAX = 140;
// Pushing up on the hands or elbows: a wrist this close to the hip–ankle line is on the floor.
// Checked while the torso travels (hip between up and down), where hands behind the head sit at 0.4 m+.
const HANDS_MIN = 0.1;
// A refused rep that lost the body for this many frames (~1/3 s) is a framing problem, not form.
const UNSEEN_MAX = 5;
// Labelled internet clips pass 3/10 (framing and angles vary); the device baselines below are the bar.

/**
 * Hip and knee angles in degrees, on the better-seen complete side; `hand` is the lower seen wrist's
 * height above the hip–ankle line in metres, null when neither wrist is seen.
 */
export type SitupSample = { hip: number; knee: number; hand: number | null; joints: Joints };

export function measureSitup(pose: Pose): SitupSample | null {
  const side = bestSide(pose, (j) => [j.shoulder, j.hip, j.knee, j.ankle]);
  if (!side) return null;
  const { shoulder: s, hip: h, knee: k, ankle: a } = SIDE[side];
  const world = pose.worldLandmarks;
  const hip = angle(world[s], world[h], world[k]);
  const knee = angle(world[h], world[k], world[a]);
  if (!Number.isFinite(hip) || !Number.isFinite(knee)) return null;
  // "Up" in the leg's plane: the bent knee above the hip–ankle line, which no shoulder width tilts.
  const up = reject(sub(world[k], world[h]), sub(world[a], world[h]));
  const heights = [SIDE.left.wrist, SIDE.right.wrist]
    .filter((w) => seen(pose, w))
    .map((w) => dot(sub(world[w], world[h]), up) / length(up))
    .filter(Number.isFinite);
  const hand = heights.length ? Math.min(...heights) : null;
  return { hip, knee, hand, joints: [s, h, k] };
}

/** Lowest wrist while the torso travels, on top of the straightest knee. */
type Attempt = { knee: number; hand: number };
type SitupReport = {
  counted: boolean;
  depth: number;
  knee: number;
  hand: number;
  downMs: number | null;
  upMs: number | null;
  cues: string[];
};
export type SitupState = CycleState<Attempt, SitupReport>;

const situpCycle = cycle<SitupSample, Attempt, SitupReport>({
  signal: (m) => m.hip,
  up: SITUP_UP,
  down: SITUP_DOWN,
  shallow: SHALLOW,
  start: (m) => m.knee <= KNEES_MAX,
  turn: (m) => m.knee <= KNEES_MAX,
  // shortcut: wrists never seen while travelling (hand stays Infinity) pass; refuse instead if cheats hide the hands.
  clean: (a) => a.knee <= KNEES_MAX && a.hand >= HANDS_MIN,
  fresh: { knee: 0, hand: Infinity },
  add: (a, m) => ({
    knee: Math.max(a.knee, m.knee),
    hand:
      m.hand !== null && m.hip > SITUP_UP && m.hip < SITUP_DOWN ? Math.min(a.hand, m.hand) : a.hand,
  }),
  report: (a, _m, r) => ({
    ...r,
    knee: a.knee,
    hand: a.hand,
    cues: r.counted
      ? []
      : [
          a.knee > KNEES_MAX
            ? 'Keep your knees bent'
            : a.hand < HANDS_MIN
              ? 'Keep your hands off the floor'
              : r.unseen > UNSEEN_MAX
                ? 'Keep your whole body in frame'
                : 'Lie back further',
        ],
  }),
});

const hands = (m: number) => (Number.isFinite(m) ? `${Math.round(m * 100)}cm` : '–');

export const situp: Exercise<SitupState, SitupSample> = {
  ...situpCycle,
  name: 'sit-ups',
  placement: 'side-floor',
  ...SETUP['side-floor'],
  hint: 'Sit up with knees bent, then lie back and curl up to count.',
  ready: 'Sit up with knees bent',
  parts: ['head', 'hips', 'feet'],
  gauge: { down: SITUP_DOWN, up: SITUP_UP },
  measure: measureSitup,
  stats: ({ lastRep: r }) =>
    r &&
    `${Math.round(r.depth)}° · KNEE ${Math.round(r.knee)}° · HANDS ${hands(r.hand)} · ${fmtMs(r.downMs)}↓ ${fmtMs(r.upMs)}↑`,
};
