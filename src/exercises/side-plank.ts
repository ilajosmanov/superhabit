import { exercise, SETUP } from './exercise';
import { hold } from './kinds/hold';
import { sidePlankPosition } from './positions/side-plank';

export const sidePlank = exercise(hold(sidePlankPosition), {
  name: 'side plank',
  // The floor spot, but you face the phone: the body line runs across the frame.
  placement: 'side-floor',
  place: SETUP['side-floor'].place,
  steps: [
    'Lay it on the floor on its long edge',
    'About 2 m away, in front of you',
    'Head to feet in frame',
  ],
  hint: 'Face the phone. The clock starts once your hips lift into a straight line.',
  how: ['Lift your hips into a straight line', 'The clock runs while you hold it'],
});
