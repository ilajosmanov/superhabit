import { exercise, SETUP } from './exercise';
import { cycle } from './kinds/cycle';
import { elevation } from './measures/elevation';
import { jointAngle } from './measures/joint-angle';
import { kneesBentPosition } from './positions/back';

export const gluteBridge = exercise(
  // The shoulder–hip–knee line as the camera sees it: lying reads 126–152°, a bridge's top 174–180°, a
  // half lift 163°, a slight one 159°. The hips' rise over the shoulders by the world guess could not
  // tell them apart: full bridges read 13–29° clip to clip, a half lift 10°.
  // shortcut: a bridge twisted at the hips reads straight side-on and counts; judge it front-on if
  // twisted bridges ever matter.
  cycle(kneesBentPosition, jointAngle('hip', 'picture'), {
    up: 155,
    down: 170,
    shallow: 160,
    fastMs: 1000,
    short: 'Lift your hips higher',
    // The hips must leave the floor too (13° and up in a bridge): lying with the legs out straight
    // is as straight a line.
    also: { measure: elevation('hips'), down: 8, shallow: 5 },
  }),
  {
    name: 'glute bridges',
    placement: 'side-floor',
    ...SETUP['side-floor'],
    hint: 'Lie back, knees bent, feet planted. Lift your hips, then lower to count.',
    how: ['Lift your hips into a straight line', 'Lower them to count'],
  },
);
