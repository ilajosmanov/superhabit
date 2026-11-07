import { SIDE } from 'superhabit-pose/joints';

import { cycle, type CycleState } from './cycle';
import { fmtMs, SETUP, type Exercise } from './exercise';
import { angle, bestSide, dot, length, sub, type Joints, type Pose } from './geometry';

// PushUpBench sweeps of starts 130–145° and peaks 155–170° stayed below the 60% gate.
// Keep the expected 120–140° floor position and a peak within 20° of straight, rather than
// accepting the 70–110° signals in some labelled variants as full hip extension.
const BRIDGE_UP = 140; // floor/start; cycle mirrors this rising signal
const BRIDGE_DOWN = 160;
const SHALLOW = 150;
const KNEE_MAX = 140;
// The shin is only an approximate floor normal: its tilt puts grounded shoulders up to ~0.9
// shin lengths from the ankle's plane in these traces. Upright setups read several lengths.
const FLOOR_MAX = 1;
// Labelled internet clips pass 2/10 (variants lift a foot or never straighten); device sets are the bar.

/** Angles on the better-seen complete side. */
export type GluteBridgeSample = {
  hip: number;
  knee: number;
  /** Shoulder displacement along the shin, in shin lengths; rejects upright setups. */
  floor: number;
  joints: Joints;
};

export function measureGluteBridge(pose: Pose): GluteBridgeSample | null {
  const side = bestSide(pose, (j) => [j.shoulder, j.hip, j.knee, j.ankle]);
  if (!side) return null;
  const { shoulder: s, hip: h, knee: k, ankle: a } = SIDE[side];
  const world = pose.worldLandmarks;
  const shin = sub(world[k], world[a]);
  const hip = angle(world[s], world[h], world[k]);
  const knee = angle(world[h], world[k], world[a]);
  const floor = dot(sub(world[s], world[a]), shin) / length(shin) ** 2;
  return [hip, knee, floor].every(Number.isFinite) ? { hip, knee, floor, joints: [s, h, k] } : null;
}

type Attempt = { knee: number; floor: number };
type GluteBridgeReport = {
  counted: boolean;
  depth: number;
  knee: number;
  downMs: number | null;
  upMs: number | null;
  cues: string[];
};
export type GluteBridgeState = CycleState<Attempt, GluteBridgeReport>;

const planted = (m: GluteBridgeSample) => Math.abs(m.floor) <= FLOOR_MAX;
const gluteBridgeCycle = cycle<GluteBridgeSample, Attempt, GluteBridgeReport>({
  signal: (m) => m.hip,
  up: BRIDGE_UP,
  down: BRIDGE_DOWN,
  shallow: SHALLOW,
  start: (m) => m.knee <= KNEE_MAX && planted(m),
  turn: (m) => m.knee <= KNEE_MAX && planted(m),
  clean: (a) => a.knee <= KNEE_MAX && a.floor <= FLOOR_MAX,
  fresh: { knee: 0, floor: 0 },
  add: (a, m) => ({
    knee: Math.max(a.knee, m.knee),
    floor: Math.max(a.floor, Math.abs(m.floor)),
  }),
  report: (a, _m, r) => ({
    ...r,
    knee: a.knee,
    cues: r.counted
      ? []
      : [
          a.knee > KNEE_MAX
            ? 'Keep your knees bent'
            : a.floor > FLOOR_MAX
              ? 'Keep your feet planted'
              : 'Lift your hips higher',
        ],
  }),
});

export const gluteBridge: Exercise<GluteBridgeState, GluteBridgeSample> = {
  ...gluteBridgeCycle,
  name: 'glute bridges',
  glyph: 'M2.4 22a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0M7.5 23 16 16l6 4v6M3 26h26',
  placement: 'side-floor',
  ...SETUP['side-floor'],
  hint: 'Start with hips down, knees bent and feet planted. Lift, then lower to count.',
  ready: 'Lie back with hips down',
  parts: ['head', 'hips', 'feet'],
  gauge: { down: BRIDGE_DOWN, up: BRIDGE_UP },
  measure: measureGluteBridge,
  stats: ({ lastRep: r }) =>
    r &&
    `${Math.round(r.depth)}° · KNEE ${Math.round(r.knee)}° · ${fmtMs(r.downMs)}↑ ${fmtMs(r.upMs)}↓`,
};
