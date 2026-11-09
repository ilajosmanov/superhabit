import { exercise } from './exercise';
import { cycle } from './kinds/cycle';
import { jointAngle } from './measures/joint-angle';
import { bothSides } from './measures/measure';
import { spread } from './measures/spread';
import { standingPosition } from './positions/standing';

const overhead = 130;

// shortcut: guessed from body proportions (feet together about 0.25 leg lengths apart, a jack's
// stance 0.6–0.8) with no jumping jack clips with gravity yet; tune on front-on device sets.
const jackCycle = cycle(
  standingPosition,
  // Both arms rise together: one alone is a wave, not a jack.
  bothSides(jointAngle('shoulder'), 45, 'lower'),
  {
    up: 45,
    down: overhead,
    shallow: 90,
    // Jacks are quick by nature.
    fastMs: 0,
    short: 'Arms overhead, feet wide',
    also: { measure: spread('sideways'), down: 0.5, shallow: 0.35, up: 0.35 },
  },
);

export const jumpingJack = exercise(jackCycle, {
  name: 'jumping jacks',
  placement: 'front-upright',
  place: 'Prop the phone upright',
  steps: [
    'Face the camera, about 2 m away',
    'Keep your feet and raised hands in frame',
    'Leave room to jump your feet apart',
  ],
  hint: 'Counting starts once you stand tall with your arms down.',
  how: ['Jump wide with arms overhead', 'Jump back to count'],
});
