import { expect, it } from 'vite-plus/test';

import { countAnswers, pickAccuracy } from './workout-feedback';

it('combines count problems in chip order but keeps Right and Not sure on their own', () => {
  const answers = countAnswers(true, true);
  const pick = (picked: string[], answer: string) => pickAccuracy(answers, picked, answer);
  // Tapped holds-first, sent reps-first: either order is one answer.
  const both = pick(pick(['Right'], 'Time too short'), 'Missed reps');
  expect(both).toEqual(['Missed reps', 'Time too short']);
  expect(pick(both, 'Not sure')).toEqual(['Not sure']);
  expect(pick(both, 'Missed reps')).toEqual(['Time too short']);
});
