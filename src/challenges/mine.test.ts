import { expect, it, vi } from 'vite-plus/test';

import { create, join, leave, recordTry, update } from './mine';
import { parse } from './saved';
import { disk } from '@/storage/__fixtures__/file-system';
import { MAX, reps } from '@/workout/plan';

vi.mock('expo-file-system', () => import('@/storage/__fixtures__/file-system'));
// The real one is native; Node has its own.
vi.mock('expo', () => ({ uuid: { v4: () => crypto.randomUUID() } }));

const challenge = {
  name: 'Squats',
  days: 21,
  restartOnMiss: false,
  session: [{ steps: [{ exercise: 'squat', goal: reps(30) }], rounds: 1 }],
} as const;
const harder = {
  ...challenge,
  name: 'More squats',
  session: [{ steps: [{ exercise: 'squat', goal: reps(40) }], rounds: 1 }],
} as const;

it('keeps what you made, your best try, what you changed and left in the file the next start reads', () => {
  vi.setSystemTime(new Date(2026, 10, 1, 9));
  const id = create(challenge);
  expect(id).not.toBeNull();
  if (!id) return;
  recordTry(id, '2026-11-01', 0.5, [15]);
  recordTry(id, '2026-11-01', 0.2, [6]);
  recordTry(id, '2026-11-02', 1, [30]);
  // A new name keeps the sets; new goals drop them, which counted toward the old ones.
  update(id, { ...challenge, name: 'Squats daily' });
  expect(parse(disk.get('challenges.json') ?? '').value[0]?.sets).toEqual({
    '2026-11-01': [15],
    '2026-11-02': [30],
  });
  update(id, harder);
  join('pushup-fifty', challenge);
  leave('pushup-fifty');

  expect(parse(disk.get('challenges.json') ?? '').value).toEqual([
    {
      id,
      challenge: harder,
      startedOn: '2026-11-01',
      progress: { '2026-11-01': 0.5, '2026-11-02': 1 },
      sets: {},
    },
  ]);
});

it('keeps the bigger of two full tries at an open-ended goal', () => {
  vi.setSystemTime(new Date(2026, 10, 1, 9));
  const id = create({
    ...challenge,
    session: [{ steps: [{ exercise: 'squat', goal: MAX }], rounds: 1 }],
  });
  if (!id) throw new Error('not saved');
  recordTry(id, '2026-11-01', 1, [12]);
  recordTry(id, '2026-11-01', 1, [20]);
  recordTry(id, '2026-11-01', 1, [5]);
  const saved = parse(disk.get('challenges.json') ?? '').value.find((entry) => entry.id === id);
  expect(saved?.sets).toEqual({ '2026-11-01': [20] });
});
