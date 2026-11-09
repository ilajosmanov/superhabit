import { expect, it } from 'vite-plus/test';

import { draftOf, newDraft, toChallenge, withAmount, withNumber } from './draft';
import { MAX, reps, seconds } from '@/workout/plan';

it('names a draft after its exercise until you type a name', () => {
  const draft = withAmount(newDraft('pushup'), 50);
  expect(toChallenge(draft).name).toBe('Push-ups');
  expect(toChallenge({ ...draft, name: '  ' }).name).toBe('Push-ups');
  expect(toChallenge({ ...draft, name: 'Morning' }).name).toBe('Morning');
});

it('sets a hold in seconds and reps in reps', () => {
  expect(withAmount(newDraft('plank'), 90).goal).toEqual(seconds(90));
  expect(withAmount(newDraft('squat'), 90).goal).toEqual(reps(90));
});

it('takes a typed number as it is, off the slider steps and past its top', () => {
  expect(withNumber(newDraft('squat'), 7).goal).toEqual(reps(7));
  expect(withNumber(newDraft('squat'), 400).goal).toEqual(reps(400));
  expect(withNumber(newDraft('plank'), 45).goal).toEqual(seconds(45));
});

it('takes the stop past the top as Max', () => {
  expect(withAmount(newDraft('squat'), 150).goal).toEqual(reps(150));
  expect(withAmount(newDraft('squat'), 155).goal).toEqual(MAX);
  expect(withAmount(newDraft('plank'), 310).goal).toEqual(MAX);
});

it('opens a one-exercise challenge as a draft, open-ended goals included', () => {
  const challenge = {
    name: 'Sit-ups',
    days: 14,
    restartOnMiss: true,
    dailyTotal: false,
    session: [{ steps: [{ exercise: 'situp', goal: MAX }], rounds: 1 }],
  } as const;
  expect(draftOf(challenge)).toEqual({
    exercise: 'situp',
    goal: MAX,
    days: 14,
    restartOnMiss: true,
    dailyTotal: false,
    name: 'Sit-ups',
  });
});

it('keeps a daily total through an edit, and gives it no Max', () => {
  const daily = toChallenge({ ...newDraft('pushup'), dailyTotal: true, goal: reps(500) });
  const draft = draftOf(daily);
  if (!draft) throw new Error('a one-exercise challenge opens as a draft');
  const renamed = toChallenge({ ...draft, name: 'Five hundred' });
  expect(renamed).toMatchObject({ dailyTotal: true, name: 'Five hundred' });
  expect(withAmount(draft, 155).goal).toEqual(reps(150));
});

const squat = { exercise: 'squat', goal: reps(10) } as const;
it.each([
  ['rounds', [{ steps: [squat], rounds: 3 }]],
  ['several steps', [{ steps: [squat, squat], rounds: 1 }]],
  [
    'several blocks',
    [
      { steps: [squat], rounds: 1 },
      { steps: [squat], rounds: 1 },
    ],
  ],
  ['a rest first', [{ steps: [{ exercise: 'rest', goal: seconds(30) }], rounds: 1 }]],
] as const)('refuses a challenge with %s', (_, session) => {
  expect(
    draftOf({ name: 'x', days: 1, restartOnMiss: false, dailyTotal: false, session }),
  ).toBeNull();
});
