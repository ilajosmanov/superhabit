import { expect, test } from 'vite-plus/test';
import { repPhrase, setPhrase } from './phrase';

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
  const pushups = { reps: 20, name: 'push-ups', place: 'Turn the phone sideways' };
  expect(setPhrase(20, pushups)).toBe('20, set done. Next, 20 push-ups. Turn the phone sideways.');
  expect(setPhrase(7, { ...pushups, reps: Infinity })).toBe(
    '7, set done. Next, push-ups. Turn the phone sideways.',
  );
  expect(setPhrase(20, null)).toBe('20. Challenge done.');
});
