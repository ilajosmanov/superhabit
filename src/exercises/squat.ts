import { exercise, SETUP } from './exercise';
import { cycle } from './kinds/cycle';
import { elevation } from './measures/elevation';
import { jointAngle } from './measures/joint-angle';
import { bothSides } from './measures/measure';
import { standingPosition } from './positions/standing';

const down = 100;

const squatCycle = cycle(
  standingPosition,
  // Real reps bend both knees within 20° of each other; a bigger gap is a kick or a mis-tracked leg.
  bothSides(jointAngle('knee'), 35),
  {
    up: 160,
    down,
    shallow: 140,
    fastMs: 800,
    deeper: 'Go deeper',
    // The thighs' elevation: 44° or less at the bottom (45° or more from upright). A shallow dip is a
    // failed rep only once under 72°, so kneeling or a bend to the phone stays silent; a real 140°
    // half squat reads ~67°.
    also: { measure: elevation('thigh'), down: 44, shallow: 72 },
  },
);

const hint = 'Counting starts once you stand tall.';
const how = [`Sit back until your knees reach ${down}°`, 'Stand all the way up'];

export const squat = exercise(squatCycle, {
  name: 'squats',
  placement: 'front-upright',
  ...SETUP['front-upright'],
  hint,
  how,
});

// shortcut: squat's thresholds, tuned front-on; side-on lunges counted as squats on clips without
// gravity (the far leg is too rough to tell them apart). Record side-on squat and lunge clips, retune.
/** The same squat with the phone side-on, so it joins lunges without moving the phone. */
export const sideSquat = exercise(squatCycle, {
  name: 'squats',
  placement: 'side-upright',
  ...SETUP['side-upright'],
  hint,
  how,
});
