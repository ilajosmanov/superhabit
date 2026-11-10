import { afterEach, beforeAll, expect, it, vi } from 'vite-plus/test';
import { createActor } from 'xstate';

import { body, detection } from '@/exercises/__fixtures__/body';
import { plank } from '@/exercises/__fixtures__/plank';
import { MAX } from '@/workout/plan/plan';
import {
  clock,
  hold,
  LOG,
  modules,
  native,
  plan,
  reset,
  squatTest,
} from '@/workout/__fixtures__/session';
import { migrateDatabase } from '@/storage/__fixtures__/database';

vi.mock('expo', () => ({ uuid: { v4: () => crypto.randomUUID() } }));
vi.mock('react-native', () => modules['react-native']);
vi.mock('superhabit-pose', () => modules['superhabit-pose']);
vi.mock('superhabit-gzip-file', () => modules['superhabit-gzip-file']);
vi.mock('expo-speech', () => modules['expo-speech']);
vi.mock('expo-file-system', () => modules['expo-file-system']);
vi.mock('expo-screen-orientation', () => modules['expo-screen-orientation']);
vi.mock('expo-constants', () => modules['expo-constants']);
vi.mock('@/storage/database', () => import('@/storage/__fixtures__/database'));

const { workoutSession } = await import('./session');
beforeAll(migrateDatabase);
afterEach(reset);

it('keeps the times of both counted and shallow cycle attempts in the finished set', () => {
  const actor = createActor(workoutSession, { input: { ...LOG, challenge: squatTest } }).start();
  const top = body({});
  const bottom = body({ thigh: 70, shin: 25 });
  const shallow = body({ thigh: 25, shin: 20 });
  [top, top, bottom, bottom, top, top, shallow, shallow, top, top].forEach((pose, i) =>
    native.onResult?.(detection(pose, 10_000 + i * 1000)),
  );
  actor.send({ type: 'end' });
  expect(actor.getSnapshot().context.results[0]).toMatchObject({
    reps: 1,
    noReps: 1,
    attempts: [
      { counted: true, startMs: 11_000, bottomMs: 13_000, endMs: 15_000, cue: null },
      { counted: false, startMs: 15_000, bottomMs: 17_000, endMs: 19_000, cue: 'Go deeper' },
    ],
  });
  actor.stop();
});

it('keeps sequence attempts with no depth or bottom, including a timed-out attempt', () => {
  const actor = createActor(workoutSession, {
    input: { ...LOG, challenge: plan({ exercise: 'burpee', goal: MAX }) },
  }).start();
  const start = clock;
  const standing = plank({ standing: true });
  hold(132, standing); // Last idle frame at 132; the attempt begins there.
  hold(132, plank({}));
  hold(132, standing); // Confirmed return at 462; next attempt starts on idle frame 528.
  hold(132, plank({})); // Plank confirmed at 660; returning to stand is due at 3660.
  hold(3300, plank({})); // First frame past the deadline is 3696.
  actor.send({ type: 'end' });
  expect(actor.getSnapshot().context.results[0]).toMatchObject({
    reps: 1,
    noReps: 1,
    attempts: [
      {
        counted: true,
        startMs: start + 132,
        bottomMs: null,
        endMs: start + 462,
        depth: null,
        cue: null,
      },
      {
        counted: false,
        startMs: start + 528,
        bottomMs: null,
        endMs: start + 3696,
        depth: null,
        cue: 'Stand tall',
      },
    ],
  });
  actor.stop();
});
