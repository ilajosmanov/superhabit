import { Joint } from 'superhabit-pose/joints';

import { cycle, type CycleState } from './cycle';
import { fmtMs, type Exercise } from './exercise';
import { angle, inFrame, type Joints, type Pose } from './geometry';

const SIDES = [
  [Joint.LEFT_SHOULDER, Joint.LEFT_HIP, Joint.LEFT_KNEE, Joint.LEFT_ANKLE],
  [Joint.RIGHT_SHOULDER, Joint.RIGHT_HIP, Joint.RIGHT_KNEE, Joint.RIGHT_ANKLE],
] as const;

// Bent thighs make a lying hip read nearer 120° than 180°; 80° requires the torso to curl up.
// Trace tuning across up 65–100°, down 95–135° and visibility 0.1–0.5 never exceeded 3/10.
// Keep a 35° excursion and normal visibility rather than admitting small crunches or hidden feet.
export const SITUP_UP = 80;
export const SITUP_DOWN = 115;
const SHALLOW = 95;
// At least 40° short of straight throughout the attempt, not just at its endpoints.
const KNEES_MAX = 140;
// shortcut: experimental (marked in the app): only 3/10 labelled clips pass the 60% gate. Revisit with floor-side
// device traces that keep the ankles visible and knees bent before exposing this exercise.

/** Hip and knee angles in degrees, on the better-seen complete side. */
export type SitupSample = { hip: number; knee: number; joints: Joints };

export function measureSitup({
  landmarks: image,
  worldLandmarks: world,
}: Pose): SitupSample | null {
  const usable = SIDES.filter((side) => side.every((i) => inFrame(image[i]) && !!world[i]));
  if (!usable.length) return null;
  const seen = (side: readonly number[]) => Math.min(...side.map((i) => image[i].visibility));
  const [s, h, k, a] = usable.reduce((best, side) => (seen(side) > seen(best) ? side : best));
  const hip = angle(world[s], world[h], world[k]);
  const knee = angle(world[h], world[k], world[a]);
  return Number.isFinite(hip) && Number.isFinite(knee) ? { hip, knee, joints: [s, h, k] } : null;
}

type Attempt = { knee: number };
type SitupReport = {
  counted: boolean;
  depth: number;
  knee: number;
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
  clean: (a) => a.knee <= KNEES_MAX,
  fresh: { knee: 0 },
  add: (a, m) => ({ knee: Math.max(a.knee, m.knee) }),
  report: (a, _m, r) => ({
    ...r,
    knee: a.knee,
    cues: r.counted ? [] : [a.knee > KNEES_MAX ? 'Keep your knees bent' : 'Lie back further'],
  }),
});

export const situp: Exercise<SitupState, SitupSample> = {
  ...situpCycle,
  name: 'sit-ups',
  experimental: true,
  glyph: 'M9.4 9a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M13 12l4 10M17 22l6-5 4 9M3 26h26',
  placement: 'side-floor',
  place: 'Turn the phone sideways',
  steps: [
    'Lay it on the floor on its long edge',
    'About 2 m away, side-on to you',
    'Head to feet in frame',
  ],
  hint: 'Sit up with knees bent, then lie back and curl up to count.',
  ready: 'Sit up with knees bent',
  parts: ['head', 'hips', 'feet'],
  gauge: { down: SITUP_DOWN, up: SITUP_UP },
  measure: measureSitup,
  stats: ({ lastRep: r }) =>
    r &&
    `${Math.round(r.depth)}° · KNEE ${Math.round(r.knee)}° · ${fmtMs(r.downMs)}↓ ${fmtMs(r.upMs)}↑`,
};
