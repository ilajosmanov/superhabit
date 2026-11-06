import { angle, type Joints, type Pose } from './geometry';
import { type Exercise } from './exercise';
import { hold, type HoldState } from './hold';
import { pushupSide } from './pushup';

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
  const side = pushupSide(pose, MIN_VISIBILITY, true);
  if (!side) return null;
  const [s, , w, h, k, a] = side;
  const world = pose.worldLandmarks;
  const support = [world[w].x - world[a].x, world[w].y - world[a].y, world[w].z - world[a].z];
  const shoulder = [world[s].x - world[a].x, world[s].y - world[a].y, world[s].z - world[a].z];
  const hip = [world[h].x - world[a].x, world[h].y - world[a].y, world[h].z - world[a].z];
  const knee = [world[k].x - world[a].x, world[k].y - world[a].y, world[k].z - world[a].z];
  const along =
    (shoulder[0] * support[0] + shoulder[1] * support[1] + shoulder[2] * support[2]) /
    Math.hypot(...support) ** 2;
  // Remove the support-line component: this stays valid when the camera rotates, for either plank.
  const up = shoulder.map((value, i) => value - along * support[i]);
  const hipHeight = hip[0] * up[0] + hip[1] * up[1] + hip[2] * up[2];
  const shape = {
    reach: angle(world[h], world[s], world[w]),
    knees: angle(world[h], world[k], world[a]),
    body: angle(world[s], world[h], world[a]),
    clearance: (knee[0] * up[0] + knee[1] * up[1] + knee[2] * up[2]) / hipHeight,
    hips: hipHeight / Math.hypot(...up) ** 2,
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
  glyph: 'M24.4 17a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M24 19.5 4 22M21 20v6h5M3 26h26',
  placement: 'side-floor',
  place: 'Turn the phone sideways',
  steps: [
    'Lay it on the floor on its long edge',
    'About 2 m away, side-on to you',
    'Head to feet in frame',
  ],
  hint: 'The clock starts once you hold a straight plank.',
  ready: 'Get into a plank',
  parts: ['head', 'hips', 'feet'],
  gauge: null,
  measure: measurePlank,
  stats: ({ heldMs, noReps }) =>
    `HELD ${(heldMs / 1000).toFixed(1)}s · ${noReps} ${noReps === 1 ? 'BREAK' : 'BREAKS'}`,
};
