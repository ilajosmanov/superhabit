import { exercise, SETUP } from './exercise';
import { cycle } from './kinds/cycle';
import { jointAngle } from './measures/joint-angle';
import { plankPosition } from './positions/plank';

export const pushup = exercise(
  cycle(plankPosition, jointAngle('elbow'), {
    // Elbow angles, tuned on device side-on: a true side view reads the elbow ~15° shallower than a
    // 45° view, and 90 rejected real reps there; soft lockouts read ~160.
    up: 150,
    down: 100,
    shallow: 120,
    fastMs: 600,
    deeper: 'Go lower',
  }),
  {
    name: 'push-ups',
    placement: 'side-floor',
    ...SETUP['side-floor'],
    hint: 'Counting starts once you hold a plank.',
  },
);
