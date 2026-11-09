import { exercise, SETUP } from './exercise';
import { cycle } from './kinds/cycle';
import { jointAngle } from './measures/joint-angle';
import { bothSides } from './measures/measure';
import { legsStraightPosition } from './positions/back';

export const legRaise = exercise(
  cycle(
    legsStraightPosition,
    // The hip, torso to thigh: lying reads 147–176°, legs up 66–92°. Both legs move together; one
    // alone reads 70° apart once the far leg shows.
    bothSides(jointAngle('hip'), 35),
    { up: 150, down: 105, shallow: 135, fastMs: 1000, short: 'Raise your legs higher' },
  ),
  {
    name: 'leg raises',
    placement: 'side-floor',
    ...SETUP['side-floor'],
    hint: 'Lie flat, legs straight. Raise them to vertical, then lower to count.',
    how: ['Raise your legs to vertical', 'Lower them to count'],
  },
);
