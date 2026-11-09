import { expect, it } from 'vite-plus/test';

import { sessionChallenge, type Library } from './library-view';
import { reps } from '@/workout/plan';

const version = (id: string, name: string, days: number) => ({
  id,
  challengeId: 'c',
  number: 1,
  name,
  days,
  dailyTotal: false,
  restartOnMiss: false,
  plan: [{ steps: [{ exercise: 'pushup', goal: reps(10) }], rounds: 1 }],
  createdAt: 0,
});

it('keeps the Done page on the version the session started on when the challenge is edited meanwhile', () => {
  const library: Library = {
    // Your challenge, edited mid-session from "Old" (1 day) to "New" (2 days); the run follows edits.
    challenges: [
      { id: 'c', owner: 'local', visibility: 'private', currentVersionId: 'v2', retiredAt: null },
    ],
    versions: [version('v1', 'Old', 1), version('v2', 'New', 2)],
    runs: [
      {
        id: 'r',
        challengeId: 'c',
        pinnedVersionId: null,
        groupChallengeId: null,
        startedOn: '2026-11-09',
        endedOn: null,
        endReason: null,
      },
    ],
    workouts: [],
    sets: [],
  };
  const during = { workoutId: 'w', versionId: 'v1' };

  expect(sessionChallenge(library, 'r', '2026-11-09', during).run).toMatchObject({
    day: 1,
    days: 1,
  });
  expect(sessionChallenge(library, 'r', '2026-11-09').run).toMatchObject({ day: 1, days: 2 });
});
