import { readSets } from '@/workout/plan/logged-set';
import type { ProgressInput, Workout } from '@/challenges/progress';
import type { LoggedSet } from '@/workout/plan/logged-set';
import { reps } from '@/workout/plan/plan';

export const input: ProgressInput = {
  run: {
    id: 'run',
    startedOn: '2026-11-01',
    endedOn: null,
    endReason: null,
    pinnedVersionId: null,
  },
  version: {
    id: 'v1',
    days: 3,
    dailyTotal: false,
    restartOnMiss: true,
    session: [{ steps: [{ exercise: 'pushup', goal: reps(500) }], rounds: 1 }],
  },
  versions: [],
  workouts: [],
  sets: readSets([]),
};
export const workout = (
  id: string,
  startedAt: number,
  changes: Partial<Workout> = {},
): Workout => ({
  id,
  startedAt,
  runId: 'run',
  versionId: 'v1',
  day: '2026-11-01',
  status: 'done',
  ...changes,
});
export const set = (workoutId: string, n: number, changes: Partial<LoggedSet> = {}): LoggedSet => ({
  id: `${workoutId}:${changes.planStep ?? 0}`,
  workoutId,
  planStep: 0,
  exercise: 'pushup',
  goal: reps(500),
  reps: n,
  heldMs: 0,
  startedAt: 0,
  endedAt: 0,
  ...changes,
});
