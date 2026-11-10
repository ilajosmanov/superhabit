import { expect, test } from 'vite-plus/test';
import { endPhrase, framePhrase, repPhrase, setPhrase, startPhrase } from './phrase';
import { MAX, reps, seconds } from '@/workout/plan/plan';

const at = (reps: number, noReps = 0) => ({ reps, noReps });

test('counts reps and encourages every 5th', () => {
  expect(repPhrase(at(0), at(1))).toBe('1');
  expect(repPhrase(at(4), at(5))).toBe('5, keep going');
});

test('no-rep says first cue or Deeper', () => {
  expect(repPhrase(at(2, 0), at(2, 1))).toBe('Deeper');
  expect(repPhrase(at(2, 0), at(2, 1), ['Knees out', 'Chest up'])).toBe('Knees out');
});

test('silent on reset or no change', () => {
  expect(repPhrase(at(7, 3), at(0, 0))).toBeNull();
  expect(repPhrase(at(3, 1), at(3, 1))).toBeNull();
});

test('set phrase says the count, then the next set or the end', () => {
  const pushups = { what: '20 push-ups', place: 'Turn the phone sideways' };
  expect(setPhrase('20', pushups)).toBe(
    '20, set done. Next, 20 push-ups. Turn the phone sideways.',
  );
  expect(setPhrase('7', { ...pushups, what: 'push-ups' })).toBe(
    '7, set done. Next, push-ups. Turn the phone sideways.',
  );
  expect(setPhrase('20', null)).toBe('20. Challenge done.');
});

test('set phrase accepts held seconds and a timed exercise next', () => {
  expect(setPhrase('2 seconds', null)).toBe('2 seconds. Challenge done.');
  expect(setPhrase('10', { what: 'plank 30 seconds', place: 'Turn the phone sideways' })).toBe(
    '10, set done. Next, plank 30 seconds. Turn the phone sideways.',
  );
});

test('set phrase keeps countdown joins short and announces timed or open-ended rests', () => {
  expect(setPhrase('1', { what: '1 squats', place: null })).toBe('1. Next, 1 squats.');
  expect(setPhrase('10', { rest: 30 })).toBe('10, set done. Rest 30 seconds.');
  expect(setPhrase('10', { rest: null })).toBe('10, set done. Rest.');
});

test('says Go only when the start position is first seen', () => {
  expect(startPhrase('waiting', 'up')).toBe('Go');
  expect(startPhrase('waiting', 'active')).toBe('Go');
  expect(startPhrase('waiting', 'waiting')).toBeNull();
  expect(startPhrase('down', 'up')).toBeNull();
});

test('names the first part out of frame', () => {
  expect(framePhrase(['feet', 'hips'])).toBe('Your feet are out of frame');
  expect(framePhrase(['head'])).toBe('Your head is out of frame');
  expect(framePhrase([])).toBeNull();
});

test('end phrase words the next goal in its unit and keeps a MAX break cue first', () => {
  expect(endPhrase('3', { name: 'push-ups', goal: reps(10), place: null }, null)).toBe(
    '3. Next, 10 push-ups.',
  );
  expect(endPhrase('3', { name: 'plank', goal: seconds(30), place: 'Lay the phone' }, null)).toBe(
    '3, set done. Next, plank 30 seconds. Lay the phone.',
  );
  expect(endPhrase('8', { name: 'squats', goal: MAX, place: null }, 'Knees out')).toBe(
    'Knees out. 8. Next, squats.',
  );
});

test('end phrase announces a rest by its goal', () => {
  expect(endPhrase('5', { name: null, goal: seconds(60), place: null }, null)).toBe(
    '5, set done. Rest 60 seconds.',
  );
  expect(endPhrase('5', { name: null, goal: MAX, place: null }, null)).toBe('5, set done. Rest.');
});
