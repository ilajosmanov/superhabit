import { SIDE } from 'superhabit-pose/joints';

import { angle, bestSide, dot, length, reject, sub, type Joints, type Pose } from './geometry';
import { fmtMs, SETUP, type Exercise } from './exercise';
import { hold, type HoldState } from './hold';

/** Shape on the better-seen side, for forearm and high planks. */
export type PlankSample = {
  reach: number;
  knees: number;
  /** Knee clearance above the ankle–wrist support line, in hip heights. */
  clearance: number;
  /** Hip clearance above the ankle–wrist support line, in shoulder heights. */
  hips: number;
  body: number;
  joints: Joints;
};

// S5 local traces: occluded knees/wrists need visibility 0.1 and forearm reach extends to 155°.
// With ankles required, the high-plank clip needs BODY_MIN 137° (was 142°); its world body line
// reads 135–149°. Hip clearance still rejects a 40° sag. Together these gates pass 7/9 clips.
const MIN_VISIBILITY = 0.1;
const REACH_MIN = 40;
const REACH_MAX = 155;
const BODY_MIN = 137;
const HIPS_MIN = 0.2;
const KNEES_MIN = 150;
// A straight forearm plank can have nearly straight knees even with its shins resting on the floor.
const CLEARANCE_MIN = 0.1;
// shortcut: these shape gates also credit other movements (6/10 push-up, 0/10 squat clips ≥10s);
// revisit movement rejection after reviewing device traces, before relying on this for accuracy.

export function measurePlank(pose: Pose): PlankSample | null {
  const side = bestSide(pose, (j) => Object.values(j), MIN_VISIBILITY);
  if (!side) return null;
  const { shoulder: s, wrist: w, hip: h, knee: k, ankle: a } = SIDE[side];
  const world = pose.worldLandmarks;
  const support = sub(world[w], world[a]);
  const shoulder = sub(world[s], world[a]);
  // Remove the support-line component: this stays valid when the camera rotates, for either plank.
  const up = reject(shoulder, support);
  const hipHeight = dot(sub(world[h], world[a]), up);
  const shape = {
    reach: angle(world[h], world[s], world[w]),
    knees: angle(world[h], world[k], world[a]),
    body: angle(world[s], world[h], world[a]),
    clearance: dot(sub(world[k], world[a]), up) / hipHeight,
    hips: hipHeight / length(up) ** 2,
  };
  const joints: Joints = [s, h, a];
  return Object.values(shape).every(Number.isFinite) ? { ...shape, joints } : null;
}

const plankHold = hold<PlankSample>({
  check: (m) => {
    if (m.reach < REACH_MIN || m.reach > REACH_MAX) return 'Get into a plank';
    if (m.knees < KNEES_MIN || m.clearance < CLEARANCE_MIN) return 'Knees off the floor';
    if (m.body < BODY_MIN || m.hips < HIPS_MIN) return 'Keep your body straight';
    return null;
  },
  lostCue: 'Back into your plank',
});

export const plank: Exercise<HoldState, PlankSample> = {
  ...plankHold,
  name: 'plank',
  // Body flat and low on the forearms, so it doesn't read as the push-up's slanted body on straight arms.
  placement: 'side-floor',
  ...SETUP['side-floor'],
  hint: 'The clock starts once you hold a straight plank.',
  ready: 'Get into a plank',
  how: ['Forearms down, heels to shoulders straight', 'The clock runs while you hold the line'],
  parts: ['head', 'hips', 'feet'],
  gauge: null,
  measure: measurePlank,
  stats: ({ heldMs, noReps }) =>
    `HELD ${fmtMs(heldMs)} · ${noReps} ${noReps === 1 ? 'BREAK' : 'BREAKS'}`,
};
