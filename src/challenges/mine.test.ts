import { expect, it, vi } from 'vite-plus/test';

import { create, join, leave, markDone, update } from './mine';
import { parse } from './saved';
import { disk } from '@/storage/__fixtures__/file-system';
import { reps } from '@/workout/plan';

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

it('keeps what you made, did, changed and left in the file the next start reads', () => {
  vi.setSystemTime(new Date(2026, 10, 1, 9));
  const id = create(challenge);
  expect(id).not.toBeNull();
  if (!id) return;
  markDone(id, '2026-11-01');
  markDone(id, '2026-11-01');
  update(id, harder);
  join('pushup-fifty', challenge);
  leave('pushup-fifty');

  expect(parse(disk.get('challenges.json') ?? '').value).toEqual([
    { id, challenge: harder, startedOn: '2026-11-01', done: ['2026-11-01'] },
  ]);
});
