import { exercise, SETUP } from './exercise';
import { hold } from './kinds/hold';
import { plankPosition } from './positions/plank';

export const plank = exercise(hold(plankPosition), {
  name: 'plank',
  placement: 'side-floor',
  ...SETUP['side-floor'],
  hint: 'The clock starts once you hold a straight plank.',
});
