import { fmtMs, SETUP, type Exercise } from './exercise';
import {
  positionCycle,
  type PositionCycleState,
  type PositionSample,
} from './kinds/position-cycle';
import { jointAngle } from './measures/joint-angle';
import { plankPosition, type PlankSample } from './positions/plank';

export type PushupSample = PositionSample<PlankSample>;
export type PushupState = PositionCycleState;

// Elbow angles, tuned on device side-on: a true side view reads the elbow ~15° shallower than a
// 45° view, and 90 rejected real reps there; soft lockouts read ~160.
const DOWN = 100;
const UP = 150;

export const pushup: Exercise<PushupState, PushupSample> = {
  ...positionCycle({
    position: plankPosition,
    measure: jointAngle('elbow'),
    up: UP,
    down: DOWN,
    shallow: 120,
    fastMs: 600,
  }),
  name: 'push-ups',
  placement: 'side-floor',
  ...SETUP['side-floor'],
  hint: 'Counting starts once you hold a plank.',
  ready: plankPosition.ready,
  // Feet too: the plank position reads the body line heel to shoulder.
  parts: ['head', 'hands', 'hips', 'feet'],
  gauge: { down: DOWN, up: UP },
  stats: ({ lastRep: r }) => r && `${Math.round(r.depth)}° · ${fmtMs(r.downMs)}↓ ${fmtMs(r.upMs)}↑`,
};
