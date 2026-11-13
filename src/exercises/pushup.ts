import { exercise, SETUP } from './exercise';
import { cycle } from './kinds/cycle';
import { jointAngle } from './measures/joint-angle';
import { plankPosition } from './positions/plank';

// The elbow as the camera sees it: on device clips a chest-to-floor bottom reads 32–67° and a half
// rep 95–111°. The world guess of the same elbow read 65–115° at the floor and 113° in a half rep.
// shortcut: all on one phone leaning on the floor, the body near side-on; elbows flared at a body
// turned to the lens read shallower, so re-tune on clips from other setups.
const down = 90;

export const pushup = exercise(
  cycle(plankPosition, jointAngle('elbow', 'picture'), {
    // Locked arms read 150–180, but between two fast reps they stop at 148: at 150 those two counted
    // as one. A half rep (95–111°) dips past `shallow` and is told to go lower; shifting at the top
    // dipped to 125–129 and is none.
    up: 140,
    down,
    shallow: 120,
    fastMs: 600,
    short: 'Go lower',
  }),
  {
    name: 'push-ups',
    placement: 'side-floor',
    ...SETUP['side-floor'],
    hint: 'Counting starts once you hold a plank.',
    how: [`Lower until your elbows reach ${down}°`, 'Press back up to straight arms'],
  },
);
