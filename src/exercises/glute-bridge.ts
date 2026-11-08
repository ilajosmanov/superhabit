import { exercise, SETUP } from './exercise';
import { cycle } from './kinds/cycle';
import { elevation } from './measures/elevation';
import { kneesBentPosition } from './positions/back';

export const gluteBridge = exercise(
  // The hips over the shoulders: lying reads under 1°, a bridge 19.6–28°, a half lift 9°, a twisted one 16°.
  // shortcut: a bridge twisted at the hips is refused only when the twist keeps them under 18°; side-on
  // the hip line's depth is a guess. Judge it front-on if twisted bridges ever matter.
  cycle(kneesBentPosition, elevation('hips'), {
    up: 3,
    down: 18,
    shallow: 8,
    fastMs: 1000,
    deeper: 'Lift your hips higher',
  }),
  {
    name: 'glute bridges',
    placement: 'side-floor',
    ...SETUP['side-floor'],
    hint: 'Lie back, knees bent, feet planted. Lift your hips, then lower to count.',
    how: ['Lift your hips into a straight line', 'Lower them to count'],
  },
);
