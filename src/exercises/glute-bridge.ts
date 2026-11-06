import { Joint } from 'superhabit-pose/joints';

import { cycle, type CycleState } from './cycle';
import { fmtMs, type Exercise } from './exercise';
import { angle, inFrame, type Joints, type Pose } from './geometry';

const SIDES = [
  [Joint.LEFT_SHOULDER, Joint.LEFT_HIP, Joint.LEFT_KNEE, Joint.LEFT_ANKLE],
  [Joint.RIGHT_SHOULDER, Joint.RIGHT_HIP, Joint.RIGHT_KNEE, Joint.RIGHT_ANKLE],
] as const;

// PushUpBench sweeps of starts 130–145° and peaks 155–170° stayed below the 60% gate.
// Keep the expected 120–140° floor position and a peak within 20° of straight, rather than
// accepting the 70–110° signals in some labelled variants as full hip extension.
export const BRIDGE_UP = 140; // floor/start; cycle mirrors this rising signal
export const BRIDGE_DOWN = 160;
const SHALLOW = 150;
const KNEE_MAX = 140;
// The shin is only an approximate floor normal: its tilt puts grounded shoulders up to ~0.9
// shin lengths from the ankle's plane in these traces. Upright setups read several lengths.
const FLOOR_MAX = 1;
// Allow ~18 cm of shoulder/ankle reconstruction jitter for a 45 cm shin, but reject a lifted
// or sliding support. Even increasing this to 0.45 and FLOOR_MAX to 1.2 did not pass the gate.
const FOOT_DRIFT_MAX = 0.4;
// shortcut: experimental (marked in the app): only 2/10 labelled clips meet the 60% gate. Several variants lift
// the better-seen foot or never approach straight hips; revisit with standard floor-bridge traces.

/** Angles and shoulder-relative ankle position on one complete side. */
type BridgeSide = {
  hip: number;
  knee: number;
  /** Shoulder displacement along the shin, in shin lengths; rejects upright setups. */
  floor: number;
  /** Shoulder-to-ankle vector in shin lengths; fixed supports stay still as the hips rise. */
  foot: readonly [number, number, number];
  side: 'left' | 'right';
  joints: Joints;
};
export type GluteBridgeSample = BridgeSide & {
  /** Both usable sides, so visibility jitter cannot lose a planted start reference. */
  supports: Record<BridgeSide['side'], BridgeSide | null>;
};

export function measureGluteBridge({
  landmarks: image,
  worldLandmarks: world,
}: Pose): GluteBridgeSample | null {
  const usable = SIDES.filter((side) => side.every((i) => inFrame(image[i]) && !!world[i]));
  if (!usable.length) return null;
  const seen = (side: readonly number[]) => Math.min(...side.map((i) => image[i].visibility));
  const best = usable.reduce((best, side) => (seen(side) > seen(best) ? side : best));
  const supports: GluteBridgeSample['supports'] = { left: null, right: null };
  for (const [s, h, k, a] of usable) {
    const shin = [world[k].x - world[a].x, world[k].y - world[a].y, world[k].z - world[a].z];
    const length = Math.hypot(...shin);
    const foot: BridgeSide['foot'] = [
      (world[a].x - world[s].x) / length,
      (world[a].y - world[s].y) / length,
      (world[a].z - world[s].z) / length,
    ];
    const hip = angle(world[s], world[h], world[k]);
    const knee = angle(world[h], world[k], world[a]);
    const floor = -(foot[0] * shin[0] + foot[1] * shin[1] + foot[2] * shin[2]) / length;
    const side = s === Joint.LEFT_SHOULDER ? 'left' : 'right';
    if ([hip, knee, floor, ...foot].every(Number.isFinite))
      supports[side] = {
        hip,
        knee,
        floor,
        foot,
        side,
        joints: [s, h, k],
      };
  }
  const selected = supports[best[0] === Joint.LEFT_SHOULDER ? 'left' : 'right'];
  return selected && { ...selected, supports };
}

type Attempt = {
  knee: number;
  floor: number;
  drift: number;
};
type GluteBridgeReport = {
  counted: boolean;
  depth: number;
  knee: number;
  drift: number;
  downMs: number | null;
  upMs: number | null;
  cues: string[];
};
type Feet = Record<GluteBridgeSample['side'], GluteBridgeSample['foot'] | null>;
export type GluteBridgeState = CycleState<Attempt, GluteBridgeReport> & { feet: Feet };
const unplanted: Feet = { left: null, right: null };

const planted = (m: BridgeSide) => Math.abs(m.floor) <= FLOOR_MAX;
const gluteBridgeCycle = cycle<GluteBridgeSample & { drift: number }, Attempt, GluteBridgeReport>({
  signal: (m) => m.hip,
  up: BRIDGE_UP,
  down: BRIDGE_DOWN,
  shallow: SHALLOW,
  start: (m) => m.knee <= KNEE_MAX && planted(m),
  turn: (m) => m.knee <= KNEE_MAX && planted(m),
  clean: (a) => a.knee <= KNEE_MAX && a.floor <= FLOOR_MAX && a.drift <= FOOT_DRIFT_MAX,
  fresh: { knee: 0, floor: 0, drift: 0 },
  add: (a, m) => ({
    knee: Math.max(a.knee, m.knee),
    floor: Math.max(a.floor, Math.abs(m.floor)),
    drift: Math.max(a.drift, m.drift),
  }),
  report: (a, _m, r) => ({
    ...r,
    knee: a.knee,
    drift: a.drift,
    cues: r.counted
      ? []
      : [
          a.knee > KNEE_MAX
            ? 'Keep your knees bent'
            : a.floor > FLOOR_MAX || a.drift > FOOT_DRIFT_MAX
              ? 'Keep your feet planted'
              : 'Lift your hips higher',
        ],
  }),
});

export const gluteBridge: Exercise<GluteBridgeState, GluteBridgeSample> = {
  ...gluteBridgeCycle,
  initial: { ...gluteBridgeCycle.initial, feet: unplanted },
  reset: (s) => ({ ...gluteBridgeCycle.reset(s), feet: unplanted }),
  step: (s, m, nowMs) => {
    const anchor = m && s.feet[m.side];
    const drift =
      m && anchor ? Math.hypot(...m.foot.map((value, i) => value - anchor[i])) : Infinity;
    const next = gluteBridgeCycle.step(s, m && { ...m, drift }, nowMs);
    let feet = next.phase === 'waiting' ? unplanted : s.feet;
    // Cycle clears its attempt on every idle start frame. Keep support references outside it,
    // and capture every usable side once at an observed hips-down start. Preserve references
    // across completions: a foot held aloft after a no-rep must not become the new floor, so a
    // side first seen after a no-rep waits for a counted rep, a reset or a return to waiting.
    const trusted = next.lastRep?.counted ?? true;
    if (trusted && m && next.phase === 'up' && next.min === 180 && m.hip <= BRIDGE_UP)
      for (const support of Object.values(m.supports)) {
        if (
          support &&
          support.hip <= BRIDGE_UP &&
          support.knee <= KNEE_MAX &&
          planted(support) &&
          !feet[support.side]
        )
          feet = { ...feet, [support.side]: support.foot };
      }
    return { ...next, feet };
  },
  name: 'glute bridges',
  experimental: true,
  glyph: 'M2.4 22a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M7.5 23 16 16l6 4v6M3 26h26',
  placement: 'side-floor',
  place: 'Turn the phone sideways',
  steps: [
    'Lay it on the floor on its long edge',
    'About 2 m away, side-on to you',
    'Head to feet in frame',
  ],
  hint: 'Start with hips down, knees bent and feet planted. Lift, then lower to count.',
  ready: 'Lie back with hips down',
  parts: ['head', 'hips', 'feet'],
  gauge: { down: BRIDGE_DOWN, up: BRIDGE_UP },
  measure: measureGluteBridge,
  stats: ({ lastRep: r }) =>
    r &&
    `${Math.round(r.depth)}° · KNEE ${Math.round(r.knee)}° · ${fmtMs(r.downMs)}↑ ${fmtMs(r.upMs)}↓`,
};
