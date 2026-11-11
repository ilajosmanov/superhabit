import { call } from './worker';

// Outbox rows as the phone writes them (`src/storage/outbox.ts` and its callers), `v` included, and
// `POST /sync`. The workouts are on 11 Nov 2026, from 08:00 UTC (London, so the same day).

const AT = Date.parse('2026-11-11T08:00:00Z');

export const version = (challengeId: string, id: string, number: number) => ({
  id,
  challengeId,
  number,
  name: 'Morning squats',
  days: 30,
  dailyTotal: false,
  restartOnMiss: true,
  plan: [{ steps: [{ exercise: 'squat', goal: { type: 'reps', n: 10 } }], rounds: 3 }],
  createdAt: Date.parse('2026-11-10T07:00:00Z'),
});
export const create = (id: string, versionId: string) => ({
  entity: 'challenge',
  entityId: id,
  op: 'create',
  payload: {
    id,
    owner: 'the-phone-says',
    visibility: 'private',
    currentVersionId: versionId,
    version: version(id, versionId, 1),
    v: 1,
  },
});
export const edit = (challengeId: string, versionId: string, number: number) => ({
  entity: 'challenge',
  entityId: challengeId,
  op: 'edit',
  payload: { version: version(challengeId, versionId, number), v: 1 },
});
export const join = (id: string, challengeId: string) => ({
  entity: 'run',
  entityId: id,
  op: 'join',
  payload: {
    id,
    challengeId,
    pinnedVersionId: null,
    groupChallengeId: null,
    startedOn: '2026-11-10',
    endedOn: null,
    endReason: null,
    v: 1,
  },
});
export const leave = (id: string) => ({
  entity: 'run',
  entityId: id,
  op: 'leave',
  payload: { endedOn: '2026-11-11', endReason: 'left', v: 1 },
});
export const freeze = (day: string) => ({
  entity: 'streak_event',
  entityId: `used:${day}`,
  op: 'add',
  payload: {
    event: { id: `used:${day}`, day, kind: 'used', createdAt: Date.parse(`${day}T09:00:00Z`) },
    v: 1,
  },
});

export const set = (workoutId: string, id: string, planStep: number) => ({
  id,
  workoutId,
  planStep,
  exercise: 'squat',
  goal: { type: 'reps', n: 10 },
  reps: 10,
  noReps: 1,
  heldMs: 0,
  startedAt: AT,
  endedAt: AT + 60_000,
  counterVersion: '1.0.0+ab12',
  attempts: [{ startMs: 0, bottomMs: 900, endMs: 1800, counted: true, depth: 0.9, cue: null }],
  metrics: null,
});
export const done = (id: string, runId: string | null, setIds: string[]) => ({
  entity: 'workout',
  entityId: id,
  op: 'done',
  payload: {
    workout: {
      id,
      runId,
      versionId: null,
      day: '2026-11-11',
      status: 'done',
      startedAt: AT,
      endedAt: AT + 300_000,
      tzOffsetMin: 0,
      tz: 'Europe/London',
      appVersion: '1.0.0',
      sets: setIds.map((setId, i) => set(id, setId, i * 2)),
    },
    v: 1,
  },
});

type Results = { results: ({ ok: true } | { ok: false; reason: string })[] };
export async function push(cookie: string, changes: object[]) {
  const response = await call('/sync', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ changes }),
  });
  return response.ok ? response.json<Results>() : response.status;
}
