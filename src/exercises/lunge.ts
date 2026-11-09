import { exercise, SETUP } from './exercise';
import { cycle } from './kinds/cycle';
import { jointAngle } from './measures/joint-angle';
import { bothSides } from './measures/measure';
import { spread } from './measures/spread';
import { uprightPosition } from './positions/standing';

const down = 115;

// Device lunges with gravity: the front knee reaches 72–106° at the bottom, side-on or facing the phone;
// facing it, the feet read 0.46–0.73 leg lengths apart.
const lungeCycle = cycle(
  uprightPosition,
  // The front knee, the more bent. Both bend in a lunge: at the bottom of device lunges the back one
  // reads 20–45° straighter; a knee lift leaves the standing leg straight, over 50° apart.
  bothSides(jointAngle('knee'), 50, 'lower'),
  {
    up: 140,
    down,
    shallow: 130,
    fastMs: 800,
    short: 'Go lower',
    // The feet a stride apart at the bottom, so a squat is no lunge.
    also: { measure: spread('forward'), down: 0.5, shallow: 0.3 },
  },
);

export const lunge = exercise(lungeCycle, {
  name: 'lunges',
  placement: 'side-upright',
  place: SETUP['side-upright'].place,
  // Facing the phone, a step toward it bends the front knee toward the camera, where it reads too
  // straight; a step back reads true.
  steps: [
    'Prop it up on its short edge',
    '2 to 3 m away, side-on or facing you',
    'Facing it, step back',
  ],
  hint: 'Counting starts once you stand tall. Either leg forward counts.',
  how: [`Step forward until your knees reach ${down}°`, 'Push back up to standing'],
});
