import { expect, it } from 'vite-plus/test';

import {
  defineChallenge,
  readChallengePlan,
  readPlan,
  reps,
  storedPlan,
  type Challenge,
} from './plan';
import { weeklySchedule, resizeSchedule } from './schedule';

const challenge: Challenge = {
  name: 'Alternate days',
  days: 3,
  dailyTotal: false,
  restartOnMiss: true,
  session: [{ rounds: 1, steps: [{ exercise: 'squat', goal: reps(10) }] }],
  schedule: ['training', 'rest', 'training'],
};

it('persists recovery separately from sets and refuses it through the legacy session reader', () => {
  const json: unknown = JSON.parse(JSON.stringify(storedPlan(defineChallenge(challenge))));
  expect(readPlan(json)).toBeNull();
  expect(readChallengePlan(json, 3)).toEqual({
    session: challenge.session,
    schedule: ['training', 'rest', 'training'],
  });
  expect(readChallengePlan(challenge.session, 3)).toEqual({ session: challenge.session });
  expect(readChallengePlan(json, 4)).toBeNull();
});

it.each(
  [[], ['rest', 'rest', 'rest'], ['training', 'rest'], ['training', 'unknown', 'rest']].map(
    (schedule) => ({ schedule }),
  ),
)('refuses an invalid calendar $schedule', ({ schedule }) => {
  expect(
    readChallengePlan({ type: 'scheduled', session: challenge.session, schedule }, 3),
  ).toBeNull();
});

it('validates goals inside a scheduled plan and checks its duration', () => {
  const session = [{ rounds: 1, steps: [{ exercise: 'plank', goal: reps(30) }] }];
  expect(readChallengePlan({ type: 'scheduled', session, schedule: ['training'] }, 1)).toBeNull();
  expect(() => defineChallenge({ ...challenge, days: 4 })).toThrow('schedule');
});

it('expands weekly training into calendar days and repeats that calendar when lengthened', () => {
  const week = weeklySchedule(7, [1, 4]);
  expect(week).toEqual(['training', 'rest', 'rest', 'training', 'rest', 'rest', 'rest']);
  expect(resizeSchedule(week, 9)).toEqual([
    'training',
    'rest',
    'rest',
    'training',
    'rest',
    'rest',
    'rest',
    'training',
    'rest',
  ]);
  expect(resizeSchedule(week, 2)).toEqual(['training', 'rest']);
  expect(() => weeklySchedule(7, [0])).toThrow();
  expect(() => weeklySchedule(1, [4])).toThrow();
});
