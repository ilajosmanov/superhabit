import { exercise, SETUP } from './exercise';
import { cycle } from './kinds/cycle';
import { height } from './measures/height';
import { jointAngle } from './measures/joint-angle';
import { bothSides } from './measures/measure';
import { standingPosition } from './positions/standing';

const squatCycle = cycle(
  standingPosition,
  // Real reps bend both knees within 20° of each other; a bigger gap is a kick or a mis-tracked leg.
  bothSides(jointAngle('knee'), 35),
  {
    up: 160,
    down: 100,
    shallow: 140,
    fastMs: 800,
    deeper: 'Go deeper',
    // The hips over the knees, in thigh lengths: 0.7 or less at the bottom (the thighs 45° or more
    // from upright). A shallow dip is a failed rep only once under 0.95, so kneeling or a bend to the
    // phone stays silent; a real 140° half squat reads ~0.92.
    also: { measure: height('thigh'), down: 0.7, shallow: 0.95 },
  },
);

const hint = 'Counting starts once you stand tall.';

export const squat = exercise(squatCycle, {
  name: 'squats',
  placement: 'front-upright',
  ...SETUP['front-upright'],
  hint,
});

// shortcut: squat's thresholds, tuned front-on; side-on lunges counted as squats on clips without
// gravity (the far leg is too rough to tell them apart). Record side-on squat and lunge clips, retune.
/** The same squat with the phone side-on, so it joins lunges without moving the phone. */
export const sideSquat = exercise(squatCycle, {
  name: 'squats',
  placement: 'side-upright',
  ...SETUP['side-upright'],
  hint,
});
