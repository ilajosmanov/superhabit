import { exercise, SETUP } from './exercise';
import { sequence } from './kinds/sequence';
import { plankPosition } from './positions/plank';
import { standingPosition } from './positions/standing';

// shortcut: a guess (down and kick back about 1.5 s, a push-up and back up about 2.5 s); tune on device
// clips filmed side-on with gravity.
const maxStepMs = 3000;

export const burpee = exercise(sequence([standingPosition, plankPosition], { maxStepMs }), {
  name: 'burpees',
  placement: 'side-upright',
  ...SETUP['side-upright'],
  hint: 'Counting starts once you stand tall.',
  how: ['Hands down, kick back into a plank', 'Jump your feet in and stand up'],
});
