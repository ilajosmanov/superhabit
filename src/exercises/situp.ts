import { exercise, SETUP } from './exercise';
import { cycle } from './kinds/cycle';
import { elevation } from './measures/elevation';
import { kneesBentPosition } from './positions/back';

export const situp = exercise(
  // The torso's elevation: lying reads under 13°, a sit-up's top 60–83°, a crunch 24–40°.
  cycle(kneesBentPosition, elevation('torso'), {
    up: 20,
    down: 50,
    shallow: 30,
    fastMs: 1000,
    short: 'Sit up higher',
  }),
  {
    name: 'sit-ups',
    placement: 'side-floor',
    ...SETUP['side-floor'],
    hint: 'Lie back, knees bent, hands behind your head. Sit up, then lie back to count.',
    how: ['Lie back', 'Curl up again to count'],
  },
);
