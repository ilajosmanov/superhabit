import { expect, it } from 'vite-plus/test';

import { parse, serialise, type Saved } from './saved';
import { reps } from '@/workout/plan';

const pushups: Saved = {
  id: 'pushup-fifty',
  challenge: {
    name: 'Push-up fifty',
    days: 21,
    restartOnMiss: false,
    session: [{ steps: [{ exercise: 'pushup', goal: reps(50) }], rounds: 1 }],
  },
  startedOn: '2026-11-01',
  progress: { '2026-11-01': 1, '2026-11-02': 0.4 },
};
const file = (challenges: unknown[]) => JSON.stringify({ version: 2, challenges });
const withChallenge = (challenge: object) => ({
  ...pushups,
  id: 'other',
  challenge: { ...pushups.challenge, ...challenge },
});

it('reads back what it wrote', () => {
  expect(parse(serialise([pushups]))).toEqual({ value: [pushups], complete: true });
});

it('reads a version 1 file, where only days done in full were kept', () => {
  const { progress: _, ...rest } = pushups;
  const old = JSON.stringify({ version: 1, challenges: [{ ...rest, done: ['2026-11-01'] }] });
  expect(parse(old)).toEqual({
    value: [{ ...pushups, progress: { '2026-11-01': 1 } }],
    complete: true,
  });
});

it.each([
  [
    'an exercise we no longer ship',
    withChallenge({
      session: [{ steps: [{ exercise: 'mountain-climber', goal: { type: 'max' } }], rounds: 1 }],
    }),
  ],
  [
    'a goal the exercise cannot take',
    withChallenge({
      session: [{ steps: [{ exercise: 'plank', goal: { type: 'reps', n: 5 } }], rounds: 1 }],
    }),
  ],
  ['zero days', withChallenge({ days: 0 })],
  ['a bad date', { ...pushups, id: 'other', progress: { yesterday: 1 } }],
  ['a share over 1', { ...pushups, id: 'other', progress: { '2026-11-01': 2 } }],
  ['a day that does not exist', { ...pushups, id: 'other', startedOn: '2026-02-30' }],
  ['days no challenge runs', withChallenge({ days: 2 ** 32 })],
  [
    'rounds that would hang the app',
    withChallenge({
      session: [{ steps: [{ exercise: 'squat', goal: { type: 'max' } }], rounds: 1e9 }],
    }),
  ],
  ['a duplicate id', pushups],
])('drops an entry with %s, keeps the rest, and reports it incomplete', (_, bad) => {
  expect(parse(file([pushups, bad]))).toEqual({ value: [pushups], complete: false });
});

it.each([
  ['not json', '{"version":1,'],
  ['an unknown version', JSON.stringify({ version: 3, challenges: [] })],
])('reads nothing from %s and reports it incomplete', (_, text) => {
  expect(parse(text)).toEqual({ value: [], complete: false });
});
