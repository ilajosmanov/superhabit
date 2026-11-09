import { exercise, SETUP } from './exercise';
import { hold } from './kinds/hold';
import { inTheAirPosition } from './positions/seated';

export const wallSit = exercise(hold(inTheAirPosition), {
  name: 'wall sit',
  placement: 'side-upright',
  ...SETUP['side-upright'],
  hint: 'The clock starts once your thighs are level and your back is on the wall.',
  how: ['Thighs level, back on the wall', 'The clock runs while you hold it'],
});
